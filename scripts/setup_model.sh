#!/usr/bin/env bash
set -euo pipefail

# One-time model provider setup for Mochi.
# Stores credentials in ~/.openai-env and optionally updates the user's shell rc.

OPENAI_ENV_FILE="$HOME/.openai-env"
DEFAULT_OPENAI_BASE_URL="https://api.openai.com/v1"
DEFAULT_OPENAI_MODEL="gpt-4.1-mini"
DEFAULT_OPENAI_API_FORMAT="chat_completions"
DEFAULT_GEMINI_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
DEFAULT_GEMINI_MODEL="gemini-2.5-flash"
DEFAULT_PROXY_URL="http://127.0.0.1:7890"

print_header() {
  printf "\n== Mochi Model Setup ==\n"
  printf "Config file: %s\n" "$OPENAI_ENV_FILE"
  printf "Used by: Mochi VS Code extension\n"
}

print_step() {
  printf "\n[%s/5] %s\n" "$1" "$2"
}

is_valid_openai_api_key() {
  local key="$1"
  [[ "$key" == sk-* && "${#key}" -ge 20 ]]
}

is_valid_gemini_api_key() {
  local key="$1"
  [[ "$key" == AIza* && "${#key}" -ge 20 ]]
}

is_valid_api_key_for_provider() {
  local provider="$1"
  local key="$2"

  if [[ "$provider" == "gemini" ]]; then
    is_valid_gemini_api_key "$key"
    return $?
  fi

  is_valid_openai_api_key "$key"
}

mask_key() {
  local key="$1"
  if [[ "${#key}" -le 12 ]]; then
    printf "<hidden>"
    return 0
  fi
  printf "%s...%s" "${key:0:7}" "${key: -4}"
}

load_existing_config() {
  if [[ ! -f "$OPENAI_ENV_FILE" ]]; then
    return 0
  fi

  # shellcheck disable=SC1090
  source "$OPENAI_ENV_FILE"
}

prompt_yes_no() {
  local prompt="$1"
  local default_choice="$2"
  local answer

  while true; do
    read -r -p "$prompt" answer
    answer="${answer:-$default_choice}"

    case "$answer" in
      y|Y|yes|YES|Yes)
        printf "y"
        return 0
        ;;
      n|N|no|NO|No)
        printf "n"
        return 0
        ;;
      *)
        printf "Please enter y or n.\n" >&2
        ;;
    esac
  done
}

choose_provider() {
  local choice

  printf "Choose provider:\n" >&2
  printf "  1) OpenAI  recommended default\n" >&2
  printf "  2) Gemini  Google AI Studio, OpenAI-compatible endpoint\n" >&2

  while true; do
    read -r -p "Provider [1]: " choice
    choice="${choice:-1}"
    case "$choice" in
      1)
        printf "openai"
        return 0
        ;;
      2)
        printf "gemini"
        return 0
        ;;
      *)
        printf "Please enter 1 or 2.\n" >&2
        ;;
    esac
  done
}

prompt_for_api_key() {
  local provider="$1"
  local current_key=""
  local input
  local reuse_current
  local key_label="OpenAI"
  local key_url="https://platform.openai.com/api-keys"
  local key_format="sk-..."
  local env_key_name="OPENAI_API_KEY"

  if [[ "$provider" == "gemini" ]]; then
    key_label="Gemini"
    key_url="https://aistudio.google.com/app/apikey"
    key_format="Google AI Studio API key"
    env_key_name="GEMINI_API_KEY"
    current_key="${GEMINI_API_KEY:-}"
  else
    if [[ -n "${MOCHI_OPENAI_API_KEY:-}" ]]; then
      env_key_name="MOCHI_OPENAI_API_KEY"
      current_key="$MOCHI_OPENAI_API_KEY"
    else
      current_key="${OPENAI_API_KEY:-}"
    fi
  fi

  if [[ -n "$current_key" ]] && is_valid_api_key_for_provider "$provider" "$current_key"; then
    printf "Detected %s in this terminal: %s\n" "$env_key_name" "$(mask_key "$current_key")" >&2
    reuse_current="$(prompt_yes_no "Use this key for Mochi? [Y/n]: " "y")"
    if [[ "$reuse_current" == "y" ]]; then
      printf "%s" "$current_key"
      return 0
    fi
  elif [[ -n "$current_key" ]]; then
    printf "Detected %s, but it does not match the expected %s key format.\n" "$env_key_name" "$key_label" >&2
    if [[ "$provider" == "openai" ]]; then
      printf "Please enter an OpenAI key for this provider.\n" >&2
    else
      printf "Please enter a %s key for this provider.\n" "$key_label" >&2
    fi
  fi

  printf "Paste your %s API key.\n" "$key_label" >&2
  printf "Format: %s\n" "$key_format" >&2
  printf "Keys: %s\n" "$key_url" >&2
  printf "Cancel: q\n" >&2

  while true; do
    read -r -p "API key: " input
    if [[ "$input" == "q" || "$input" == "Q" ]]; then
      printf "Setup cancelled.\n" >&2
      exit 1
    fi

    if [[ "$provider" == "gemini" ]] && is_valid_gemini_api_key "$input"; then
      printf "%s" "$input"
      return 0
    fi

    if [[ "$provider" == "openai" ]] && is_valid_openai_api_key "$input"; then
      printf "%s" "$input"
      return 0
    fi

    printf "That does not look like a valid %s API key. Please try again.\n" "$key_label" >&2
  done
}

choose_model() {
  local provider="$1"
  local choice
  local custom_model

  if [[ "$provider" == "gemini" ]]; then
    printf "Choose model:\n" >&2
    printf "  1) gemini-2.5-flash  recommended\n" >&2
    printf "  2) gemini-2.5-pro    stronger, higher cost\n" >&2
    printf "  3) Custom\n" >&2

    while true; do
      read -r -p "Model [1]: " choice
      choice="${choice:-1}"
      case "$choice" in
        1)
          printf "gemini-2.5-flash"
          return 0
          ;;
        2)
          printf "gemini-2.5-pro"
          return 0
          ;;
        3)
          read -r -p "Custom model [$DEFAULT_GEMINI_MODEL]: " custom_model
          printf "%s" "${custom_model:-$DEFAULT_GEMINI_MODEL}"
          return 0
          ;;
        *)
          printf "Please enter 1, 2, or 3.\n" >&2
          ;;
      esac
    done
  fi

  printf "Choose model:\n" >&2
  printf "  1) gpt-4.1-mini  recommended for local agent development\n" >&2
  printf "  2) gpt-4.1       stronger, higher cost\n" >&2
  printf "  3) Custom\n" >&2

  while true; do
    read -r -p "Model [1]: " choice
    choice="${choice:-1}"
    case "$choice" in
      1)
        printf "gpt-4.1-mini"
        return 0
        ;;
      2)
        printf "gpt-4.1"
        return 0
        ;;
      3)
        read -r -p "Custom model [$DEFAULT_OPENAI_MODEL]: " custom_model
        printf "%s" "${custom_model:-$DEFAULT_OPENAI_MODEL}"
        return 0
        ;;
      *)
        printf "Please enter 1, 2, or 3.\n" >&2
        ;;
    esac
  done
}

detect_rc_file() {
  local shell_name
  shell_name="$(basename "${SHELL:-}")"

  case "$shell_name" in
    zsh)
      printf "%s/.zshrc" "$HOME"
      ;;
    bash)
      printf "%s/.bashrc" "$HOME"
      ;;
    *)
      if [[ -f "$HOME/.zshrc" ]]; then
        printf "%s/.zshrc" "$HOME"
      else
        printf "%s/.bashrc" "$HOME"
      fi
      ;;
  esac
}

add_line_if_missing() {
  local line="$1"
  local file="$2"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  if ! grep -Fq "$line" "$file"; then
    printf "\n%s\n" "$line" >> "$file"
  fi
}

remove_proxy_block() {
  local rc_file="$1"
  if [[ ! -f "$rc_file" ]]; then
    return 0
  fi

  if grep -Fq "# MOCHI_OPENAI_PROXY_START" "$rc_file"; then
    awk '
      BEGIN { in_block=0 }
      /^# MOCHI_OPENAI_PROXY_START$/ { in_block=1; next }
      /^# MOCHI_OPENAI_PROXY_END$/ { in_block=0; next }
      { if (!in_block) print }
    ' "$rc_file" > "$rc_file.tmp"
    mv "$rc_file.tmp" "$rc_file"
  fi

  if grep -Fq "# OPENAI_PROXY_START" "$rc_file"; then
    awk '
      BEGIN { in_block=0 }
      /^# OPENAI_PROXY_START$/ { in_block=1; next }
      /^# OPENAI_PROXY_END$/ { in_block=0; next }
      { if (!in_block) print }
    ' "$rc_file" > "$rc_file.tmp"
    mv "$rc_file.tmp" "$rc_file"
  fi
}

write_proxy_block() {
  local rc_file="$1"
  local proxy_url="$2"

  mkdir -p "$(dirname "$rc_file")"
  touch "$rc_file"
  remove_proxy_block "$rc_file"
  cat >> "$rc_file" <<EOF

# MOCHI_OPENAI_PROXY_START
export HTTP_PROXY="$proxy_url"
export HTTPS_PROXY="$proxy_url"
# MOCHI_OPENAI_PROXY_END
EOF
}

print_header

rc_file="$(detect_rc_file)"
mkdir -p "$(dirname "$OPENAI_ENV_FILE")"
load_existing_config

print_step "1" "Provider"
provider="$(choose_provider)"

if [[ "$provider" == "gemini" ]]; then
  base_url="$DEFAULT_GEMINI_BASE_URL"
else
  base_url="$DEFAULT_OPENAI_BASE_URL"
fi

print_step "2" "API key"
api_key="$(prompt_for_api_key "$provider")"

print_step "3" "Model"
openai_model="$(choose_model "$provider")"

print_step "4" "Save local config"
openai_saved_key="${MOCHI_OPENAI_API_KEY:-}"
if [[ -z "$openai_saved_key" ]] &&
  [[ "${MOCHI_MODEL_PROVIDER:-}" == "openai" ]] &&
  [[ -n "${OPENAI_API_KEY:-}" ]] &&
  is_valid_openai_api_key "$OPENAI_API_KEY"; then
  openai_saved_key="$OPENAI_API_KEY"
fi

gemini_saved_key="${GEMINI_API_KEY:-}"
active_api_key="$api_key"

if [[ "$provider" == "openai" ]]; then
  openai_saved_key="$api_key"
else
  gemini_saved_key="$api_key"
fi

cat > "$OPENAI_ENV_FILE" <<EOF
# Generated by scripts/setup_model.sh
export MOCHI_MODEL_PROVIDER="$provider"
export OPENAI_API_KEY="$active_api_key"
export OPENAI_BASE_URL="$base_url"
export OPENAI_MODEL="$openai_model"
export OPENAI_API_FORMAT="$DEFAULT_OPENAI_API_FORMAT"
EOF

if [[ -n "$openai_saved_key" ]] && is_valid_openai_api_key "$openai_saved_key"; then
  cat >> "$OPENAI_ENV_FILE" <<EOF
export MOCHI_OPENAI_API_KEY="$openai_saved_key"
EOF
fi

if [[ -n "$gemini_saved_key" ]] && is_valid_gemini_api_key "$gemini_saved_key"; then
  cat >> "$OPENAI_ENV_FILE" <<EOF
export GEMINI_API_KEY="$gemini_saved_key"
EOF
fi
chmod 600 "$OPENAI_ENV_FILE"

printf "Saved: %s\n" "$OPENAI_ENV_FILE"
printf "Provider: %s\n" "$provider"
printf "Model: %s\n" "$openai_model"

add_to_shell="$(prompt_yes_no "Add to shell startup? [Y/n]: " "y")"
if [[ "$add_to_shell" == "y" ]]; then
  add_line_if_missing 'source "$HOME/.openai-env"' "$rc_file"
  printf "Shell startup: %s\n" "$rc_file"
else
  printf "Shell startup: skipped\n"
fi

print_step "5" "Optional proxy"
use_proxy="$(prompt_yes_no "Use proxy? [y/N]: " "n")"
if [[ "$use_proxy" == "y" ]]; then
  read -r -p "Proxy URL [$DEFAULT_PROXY_URL]: " proxy_url
  proxy_url="${proxy_url:-$DEFAULT_PROXY_URL}"
  write_proxy_block "$rc_file" "$proxy_url"
  printf "Proxy: %s\n" "$proxy_url"
else
  remove_proxy_block "$rc_file"
  printf "Proxy: disabled\n"
fi

# Load now for commands launched by this script. This cannot modify the parent shell.
# shellcheck disable=SC1090
source "$OPENAI_ENV_FILE"

printf "\nSetup complete.\n"
printf "Next steps:\n"
printf "  1. npm install\n"
printf "  2. Open repo in VS Code\n"
printf "  3. Press F5\n"
printf "  4. Run: Local Agent: Open Chat\n"
printf "\nOptional terminal check:\n"
printf "  source %s && [ -n \"\$OPENAI_API_KEY\" ] && echo ok\n" "$OPENAI_ENV_FILE"
