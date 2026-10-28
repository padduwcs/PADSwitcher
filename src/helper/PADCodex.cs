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
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;

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
                bool relay = args[0] == "--host-stdio";
                using (var child = Process.Start(new ProcessStartInfo(executable, String.Join(" ", rest.ConvertAll(Quote).ToArray())) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = relay, RedirectStandardOutput = relay, RedirectStandardError = relay })) {
                    if (!AssignProcessToJobObject(job, child.Handle)) { child.Kill(); child.WaitForExit(); throw new IOException(); }
                    Task output = null, error = null;
                    if (relay) {
                        output = Pump(child.StandardOutput.BaseStream, Console.OpenStandardOutput());
                        error = Pump(child.StandardError.BaseStream, Console.OpenStandardError());
                        Task.Run(async () => { try { await Pump(Console.OpenStandardInput(), child.StandardInput.BaseStream); child.StandardInput.Close(); } catch { } });
                    }
                    while (!child.WaitForExit(100)) {
                        if (owner.HasExited) return 1; // finally closes the job and kills Codex descendants.
                    }
                    if (relay) Task.WaitAll(output, error);
                    return child.ExitCode;
                }
            } finally { CloseHandle(job); }
        }
    }
    static async Task Pump(Stream input, Stream output) {
        byte[] buffer = new byte[65536]; int count;
        try { while ((count = await input.ReadAsync(buffer, 0, buffer.Length)) != 0) { await output.WriteAsync(buffer, 0, count); await output.FlushAsync(); } }
        finally { Array.Clear(buffer, 0, buffer.Length); }
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
    static string configurationFile;
    static Dictionary<string, object> Configuration() {
        string file = Environment.GetEnvironmentVariable("PADSWITCHER_CONNECTION_FILE");
        if (String.IsNullOrEmpty(file)) file = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "connection.json");
        configurationFile = Path.GetFullPath(file);
        return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(ReadPrivate(file, 16384));
    }
    static string StringValue(Dictionary<string, object> config, string key) { return (string)config[key]; }
    static async Task<Dictionary<string, object>> StartupRequest(ClientWebSocket ws, string id, string method, object parameters, CancellationToken cancel) {
        var serializer = new JavaScriptSerializer { MaxJsonLength = MaxFrame };
        byte[] request = Utf8.GetBytes(serializer.Serialize(new { id = id, method = method, @params = parameters }));
        await ws.SendAsync(new ArraySegment<byte>(request), WebSocketMessageType.Text, true, cancel);
        byte[] buffer = new byte[65536];
        for (;;) {
            using (var frame = new MemoryStream()) {
                WebSocketReceiveResult result;
                do {
                    result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), cancel);
                    if (result.MessageType != WebSocketMessageType.Text || frame.Length + result.Count > MaxFrame) throw new IOException();
                    frame.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);
                var message = serializer.Deserialize<Dictionary<string, object>>(Utf8.GetString(frame.ToArray()));
                object responseId;
                if (!message.TryGetValue("id", out responseId) || !String.Equals(responseId as string, id, StringComparison.Ordinal) || message.ContainsKey("method")) continue;
                if (message.ContainsKey("error")) throw new IOException();
                return (Dictionary<string, object>)message["result"];
            }
        }
    }
    static async Task StartupConfiguration(Uri url, string token) {
        // New desktops perform this one-shot policy read before opening their
        // interactive transport. Read the selected native backend's real policy;
        // never invent an unrestricted policy or modify the original sign-in.
        using (var ws = new ClientWebSocket()) using (var cancel = new CancellationTokenSource(30000)) {
            ws.Options.Proxy = null; ws.Options.SetRequestHeader("Authorization", "Bearer " + token);
            await ws.ConnectAsync(url, cancel.Token);
            var initialized = await StartupRequest(ws, "pad-startup-init", "initialize", new {
                clientInfo = new { name = "codex_desktop", title = "Codex Desktop", version = "startup" },
                capabilities = new { experimentalApi = true }, _padswitcherStartup = true
            }, cancel.Token);
            string agent = StringValue(initialized, "userAgent");
            var version = System.Text.RegularExpressions.Regex.Match(agent, @"^[^/\s]+/(?<version>\d+\.\d+\.\d+[^\s]*)");
            if (!version.Success) throw new IOException();
            byte[] ready = Utf8.GetBytes("{\"method\":\"initialized\",\"params\":{}}");
            await ws.SendAsync(new ArraySegment<byte>(ready), WebSocketMessageType.Text, true, cancel.Token);
            var policy = await StartupRequest(ws, "pad-startup-policy", "configRequirements/read", new { }, cancel.Token);
            if (!policy.ContainsKey("requirements")) throw new IOException();
            Console.WriteLine(new JavaScriptSerializer { MaxJsonLength = MaxFrame }.Serialize(new { appServerVersion = version.Groups["version"].Value, configRequirements = policy }));
        }
    }
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
                        string clientKind = Environment.GetEnvironmentVariable("PADSWITCHER_CLIENT_KIND");
                        if (clientKind == "jetbrains" || clientKind == "desktop") {
                            var serializer = new JavaScriptSerializer(); serializer.MaxJsonLength = MaxFrame;
                            var message = serializer.Deserialize<Dictionary<string, object>>(line);
                            if (message.ContainsKey("method") && (string)message["method"] == "initialize") {
                                var parameters = (Dictionary<string, object>)message["params"];
                                parameters["_padswitcherClient"] = clientKind;
                                if (clientKind == "desktop") {
                                    var environment = new Dictionary<string, object>();
                                    foreach (string key in new [] { "CODEX_APP_TOOLS_PIPE_PATH", "CODEX_MCP_NODE_PATH" }) {
                                        string value = Environment.GetEnvironmentVariable(key);
                                        if (!String.IsNullOrEmpty(value)) environment[key] = value;
                                    }
                                    parameters["_padswitcherDesktopEnvironment"] = environment;
                                    parameters["_padswitcherDesktopConfig"] = DesktopConfig(Environment.GetCommandLineArgs());
                                }
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
    static Dictionary<string, object> DesktopConfig(string[] args) {
        var result = new Dictionary<string, object>();
        for (int i = 0; i < args.Length; i++) {
            string value = null;
            if ((args[i] == "-c" || args[i] == "--config") && i + 1 < args.Length) value = args[++i];
            else if (args[i].StartsWith("--config=", StringComparison.Ordinal)) value = args[i].Substring(9);
            if (value == null) continue;
            int equal = value.IndexOf('='); if (equal < 0) continue;
            string key = value.Substring(0, equal).Trim(), setting = value.Substring(equal + 1).Trim();
            if ((key == "plugins.codex-app-tools@openai-bundled.mcp_servers.codex_app.enabled" || key == "plugins.code-review@openai-bundled.mcp_servers.code-review.enabled") && (setting == "true" || setting == "false")) result[key] = setting == "true";
        }
        return result;
    }
    static volatile string toolsTarget;
    static bool PipeName(string value) {
        return value != null && System.Text.RegularExpressions.Regex.IsMatch(value, @"^\\\\\.\\pipe\\[A-Za-z0-9_.{}-]{1,200}$");
    }
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetNamedPipeServerProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle pipe, out uint pid);
    [DllImport("advapi32.dll", SetLastError = true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    static bool SameUser(NamedPipeClientStream pipe) {
        uint pid; if (!GetNamedPipeServerProcessId(pipe.SafePipeHandle, out pid)) return false;
        IntPtr process = OpenProcess(0x1000, false, pid); if (process == IntPtr.Zero) return false;
        try {
            IntPtr token; if (!OpenProcessToken(process, 8, out token)) return false;
            try { using (var identity = new WindowsIdentity(token)) return identity.User.Equals(WindowsIdentity.GetCurrent().User); }
            finally { CloseHandle(token); }
        } finally { CloseHandle(process); }
    }
    static async Task RelayTools(NamedPipeServerStream front) {
        using (front) {
            try {
                string target = toolsTarget;
                if (!PipeName(target)) return;
                using (var back = new NamedPipeClientStream(".", target.Substring(9), PipeDirection.InOut, PipeOptions.Asynchronous)) {
                    await back.ConnectAsync(5000);
                    if (!SameUser(back)) return;
                    Task input = front.CopyToAsync(back), output = back.CopyToAsync(front);
                    await Task.WhenAny(input, output);
                    front.Dispose(); back.Dispose();
                    try { await Task.WhenAll(input, output); } catch { }
                }
            } catch { } // Pipe paths and tool payloads never enter logs.
        }
    }
    static int ToolsPipe(string[] args) {
        if (!PipeName(args[2]) || !args[2].Substring(9).StartsWith("PADSwitcher-tools-", StringComparison.Ordinal)) throw new IOException();
        using (var owner = Process.GetProcessById(Int32.Parse(args[1]))) {
            var handle = owner.Handle; if (owner.HasExited) return 1;
            var security = new PipeSecurity(); security.SetAccessRuleProtection(true, false);
            var user = WindowsIdentity.GetCurrent().User; security.SetOwner(user);
            foreach (var sid in new [] {user, new SecurityIdentifier("S-1-5-18")}) security.AddAccessRule(new PipeAccessRule(sid, PipeAccessRights.FullControl, AccessControlType.Allow));
            Task.Run(() => { while (!owner.WaitForExit(200)) { } Environment.Exit(0); });
            Task.Run(async () => {
                for (;;) {
                    NamedPipeServerStream front = null;
                    try {
                        front = new NamedPipeServerStream(args[2].Substring(9), PipeDirection.InOut, 16, PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 65536, 65536, security);
                        await front.WaitForConnectionAsync();
                        var serving = RelayTools(front); front = null;
                    } catch { if (front != null) front.Dispose(); }
                    await Task.Delay(10);
                }
            });
            string line;
            while ((line = Console.ReadLine()) != null) {
                if (!PipeName(line) || line == args[2]) return 1;
                toolsTarget = line;
            }
            return 0;
        }
    }
    public static int Main(string[] args) {
        bool startup = Array.IndexOf(args, "--print-startup-config") >= 0;
        try {
            if (args.Length > 0 && (args[0] == "--host" || args[0] == "--host-stdio")) return Host(args);
            if (args.Length == 3 && args[0] == "--tools-pipe") return ToolsPipe(args);
            var config = Configuration(); var url = new Uri(StringValue(config, "url"));
            if (url.Scheme != "ws" || url.Host != "127.0.0.1" || url.Port < 1 || url.UserInfo != "" || url.AbsolutePath != "/") throw new IOException();
            string tokenFile = StringValue(config, "tokenFile");
            if (!String.Equals(Path.GetFullPath(tokenFile), Path.Combine(Path.GetDirectoryName(configurationFile), "client-capability"), StringComparison.OrdinalIgnoreCase)) throw new IOException();
            string token = ReadPrivate(tokenFile, 256).Trim();
            if (!System.Text.RegularExpressions.Regex.IsMatch(token, "^[a-f0-9]{64}$")) throw new IOException();
            bool server = Array.IndexOf(args, "app-server") >= 0;
            if (startup) {
                if (!server || Array.IndexOf(args, "--startup-sign-out") >= 0) throw new IOException();
                StartupConfiguration(url, token).GetAwaiter().GetResult(); return 0;
            }
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
            if (startup) Console.WriteLine("{\"error\":{\"code\":-32000,\"message\":\"Desktop startup policy is unavailable. Manage authentication and reconnect in PADSwitcher.\"}}");
            Console.Error.WriteLine("PADSwitcher gateway is unavailable. Open PADSwitcher and choose an account, then reconnect Codex."); return 1;
        }
    }
}
