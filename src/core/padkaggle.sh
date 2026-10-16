# Sourced by Bash 3.2+ or Zsh. Secrets remain in this shell's memory/environment.
padkaggle() {
  case $- in *x*) set +x; local _pad_trace=1 ;; *) local _pad_trace=0 ;; esac
  local _pad_action="${1:-status}" _pad_payload _pad_rc=0
  case "$_pad_action" in
    use)
      if [ "$#" -ne 2 ]; then printf '%s\n' 'Usage: padkaggle use <account>' >&2; _pad_rc=2
      elif _pad_payload=$("$_PAD_KAGGLE_HELPER" --kaggle-env "$_PAD_KAGGLE_ROOT" "$2"); then
        if [ "${_PAD_KAGGLE_ACTIVE:-0}" != 1 ]; then
          _PAD_KAGGLE_RESTORE=$("$_PAD_KAGGLE_HELPER" --kaggle-restore) || _pad_rc=$?
        fi
        if [ "$_pad_rc" -eq 0 ]; then
          eval "$_pad_payload"
          _PAD_KAGGLE_ACTIVE=1
          printf 'Kaggle: %s\n' "$KAGGLE_USERNAME"
        fi
      else _pad_rc=$?; fi
      ;;
    off)
      if [ "${_PAD_KAGGLE_ACTIVE:-0}" = 1 ]; then
        _pad_payload=$("$_PAD_KAGGLE_HELPER" --kaggle-clear) || _pad_rc=$?
        if [ "$_pad_rc" -eq 0 ]; then eval "$_pad_payload"; eval "$_PAD_KAGGLE_RESTORE"; unset _PAD_KAGGLE_RESTORE _PAD_KAGGLE_ACTIVE; fi
      fi
      ;;
    list) "$_PAD_KAGGLE_HELPER" --kaggle-list "$_PAD_KAGGLE_ROOT" || _pad_rc=$? ;;
    status) if [ "${_PAD_KAGGLE_ACTIVE:-0}" = 1 ]; then printf 'Kaggle: %s\n' "$KAGGLE_USERNAME"; else printf '%s\n' 'No account selected'; fi ;;
    *) printf '%s\n' 'Usage: padkaggle {use <account>|off|list|status}' >&2; _pad_rc=2 ;;
  esac
  unset _pad_payload
  if [ "$_pad_trace" = 1 ]; then set -x; fi
  return "$_pad_rc"
}
