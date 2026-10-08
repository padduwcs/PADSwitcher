using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;

// Native launcher and newline JSON <-> WebSocket transport. It does not implement Codex tools.
internal static class PADCodex {
    const int MaxFrame = 32 * 1024 * 1024;
    static readonly Encoding Utf8 = new UTF8Encoding(false, true);
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime; public uint Flags; public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcesses; public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr info, uint size);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static int Host(string[] args) {
        if (args.Length < 4) throw new IOException();
        using (var owner = Process.GetProcessById(Int32.Parse(args[1]))) {
            // Acquire the actual process handle before launching; PID reuse cannot change this owner.
            var ownerHandle = owner.Handle;
            if (owner.HasExited) return 1;
            IntPtr job = CreateJobObject(IntPtr.Zero, null); if (job == IntPtr.Zero) throw new IOException();
            try {
                var limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE
                int size = Marshal.SizeOf(limits); IntPtr pointer = Marshal.AllocHGlobal(size);
                try { Marshal.StructureToPtr(limits, pointer, false); if (!SetInformationJobObject(job, 9, pointer, (uint)size)) throw new IOException(); }
                finally { Marshal.FreeHGlobal(pointer); }
                string executable = args[2];
                if (!Path.IsPathRooted(executable) || !String.Equals(Path.GetFileName(executable), "codex.exe", StringComparison.OrdinalIgnoreCase)) throw new IOException();
                var rest = new List<string>(args); rest.RemoveRange(0, 3);
                using (var child = Process.Start(new ProcessStartInfo(executable, String.Join(" ", rest.ConvertAll(Quote).ToArray())) { UseShellExecute = false, CreateNoWindow = true })) {
                    if (!AssignProcessToJobObject(job, child.Handle)) { child.Kill(); child.WaitForExit(); throw new IOException(); }
                    while (!child.WaitForExit(100)) {
                        if (owner.HasExited) return 1; // finally closes the job and kills Codex descendants.
                    }
                    return child.ExitCode;
                }
            } finally { CloseHandle(job); }
        }
    }
    static string Quote(string value) {
        var output = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') output.Append('\\', slashes * 2 + 1);
            else output.Append('\\', slashes);
            output.Append(c); slashes = 0;
        }
        output.Append('\\', slashes * 2).Append('"'); return output.ToString();
    }
    static string ReadPrivate(string file, int limit) {
        if ((File.GetAttributes(file) & FileAttributes.ReparsePoint) != 0) throw new IOException();
        if (new FileInfo(file).Length > limit) throw new IOException();
        return File.ReadAllText(file, Utf8);
    }
    static Dictionary<string, object> Configuration() {
        string file = Environment.GetEnvironmentVariable("PADSWITCHER_CONNECTION_FILE");
        if (String.IsNullOrEmpty(file)) file = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "PADSwitcher", "data", "gateway", "connection.json");
        return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(ReadPrivate(file, 16384));
    }
    static string StringValue(Dictionary<string, object> config, string key) { return (string)config[key]; }
    static async Task Bridge(Uri url, string token) {
        using (var ws = new ClientWebSocket()) {
            ws.Options.Proxy = null;
            ws.Options.SetRequestHeader("Authorization", "Bearer " + token);
            using (var cancel = new CancellationTokenSource()) {
                cancel.CancelAfter(10000); await ws.ConnectAsync(url, cancel.Token); cancel.CancelAfter(Timeout.Infinite);
                var input = Task.Run(async () => {
                    var reader = new StreamReader(Console.OpenStandardInput(), Utf8, false, 8192);
                    while (ws.State == WebSocketState.Open) {
                        string line = await reader.ReadLineAsync(); if (line == null) break;
                        if (Environment.GetEnvironmentVariable("PADSWITCHER_CLIENT_KIND") == "jetbrains") {
                            var serializer = new JavaScriptSerializer(); serializer.MaxJsonLength = MaxFrame;
                            var message = serializer.Deserialize<Dictionary<string, object>>(line);
                            if (message.ContainsKey("method") && (string)message["method"] == "initialize") {
                                var parameters = (Dictionary<string, object>)message["params"];
                                parameters["_padswitcherClient"] = "jetbrains";
                                line = serializer.Serialize(message);
                            }
                        }
                        byte[] bytes = Utf8.GetBytes(line); if (bytes.Length > MaxFrame) throw new IOException();
                        await ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cancel.Token);
                        Array.Clear(bytes, 0, bytes.Length);
                    }
                });
                var output = Task.Run(async () => {
                    byte[] buffer = new byte[65536]; var writer = new StreamWriter(Console.OpenStandardOutput(), Utf8, 8192) { AutoFlush = true };
                    while (ws.State == WebSocketState.Open) {
                        using (var frame = new MemoryStream()) {
                            WebSocketReceiveResult result;
                            do {
                                result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), cancel.Token);
                                if (result.MessageType == WebSocketMessageType.Close) return;
                                if (result.MessageType != WebSocketMessageType.Text || frame.Length + result.Count > MaxFrame) throw new IOException();
                                frame.Write(buffer, 0, result.Count);
                            } while (!result.EndOfMessage);
                            await writer.WriteLineAsync(Utf8.GetString(frame.ToArray()));
                        }
                    }
                });
                var ended = await Task.WhenAny(input, output); cancel.Cancel(); ws.Abort(); await ended;
                // Observe pending cancellation without waiting for an open stdin to finish.
                Task ignoredInput = input.ContinueWith(t => { var ignored = t.Exception; }, TaskContinuationOptions.OnlyOnFaulted);
                Task ignoredOutput = output.ContinueWith(t => { var ignored = t.Exception; }, TaskContinuationOptions.OnlyOnFaulted);
            }
        }
    }
    public static int Main(string[] args) {
        try {
            if (args.Length > 0 && args[0] == "--host") return Host(args);
            var config = Configuration(); var url = new Uri(StringValue(config, "url"));
            if (url.Scheme != "ws" || url.Host != "127.0.0.1" || url.Port < 1 || url.UserInfo != "" || url.AbsolutePath != "/") throw new IOException();
            string tokenFile = StringValue(config, "tokenFile");
            string token = ReadPrivate(tokenFile, 256).Trim();
            if (!System.Text.RegularExpressions.Regex.IsMatch(token, "^[a-f0-9]{64}$")) throw new IOException();
            bool server = Array.IndexOf(args, "app-server") >= 0;
            if (server) { Bridge(url, token).GetAwaiter().GetResult(); return 0; }
            if (Array.IndexOf(args, "--no-daemon") >= 0 || Array.IndexOf(args, "--remote") >= 0 || (args.Length > 0 && (args[0] == "exec" || args[0] == "e" || args[0] == "login" || args[0] == "logout" || args[0] == "daemon" || args[0] == "review" || args[0] == "cloud"))) {
                Console.Error.WriteLine("PADCodex supports the interactive Codex CLI. Manage authentication in PADSwitcher."); return 2;
            }
            string executable = StringValue(config, "executable");
            if (!Path.IsPathRooted(executable) || !String.Equals(Path.GetFileName(executable), "codex.exe", StringComparison.OrdinalIgnoreCase)) throw new IOException();
            var arguments = new List<string> { "--remote", url.ToString(), "--remote-auth-token-env", "PADSWITCHER_GATEWAY_TOKEN" };
            arguments.AddRange(args);
            var start = new ProcessStartInfo(executable, String.Join(" ", arguments.ConvertAll(Quote).ToArray())) { UseShellExecute = false };
            start.EnvironmentVariables["PADSWITCHER_GATEWAY_TOKEN"] = token;
            start.EnvironmentVariables["CODEX_HOME"] = StringValue(config, "home");
            using (var child = Process.Start(start)) { child.WaitForExit(); return child.ExitCode; }
        } catch {
            Console.Error.WriteLine("PADSwitcher gateway is unavailable. Open PADSwitcher and choose an account, then reconnect Codex."); return 1;
        }
    }
}
