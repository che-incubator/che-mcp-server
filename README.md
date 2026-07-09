# che-mcp-server

MCP server for Eclipse Che — exposes DevWorkspace operations and tmux-based coding agent session control as MCP tools. Any MCP-compatible AI agent can create, start, stop, and inspect workspaces, launch coding agents inside them, monitor output, and relay input.

## Agent Quick Start

### On-cluster (agent running as a DevWorkspace)

The MCP server is deployed as a service in the user namespace. Connect to it directly:

```bash
# Claude Code
claude mcp add --transport http che http://che-mcp-server:8080/mcp

# ZeroClaw — add to zeroclaw.toml
[[mcp.servers]]
name = "che"
transport = "http"
url = "http://che-mcp-server:8080/mcp"
```

### Local (from git repo)

```bash
git clone git@github.com:che-incubator/che-mcp-server.git
cd che-mcp-server
npm ci && npm run build

# Claude Code
claude mcp add che-mcp-server -- node dist/index.js

# Or run directly
node dist/index.js
```

### From npm (once published)

```bash
# One-off
npx che-mcp-server

# Global install
npm install -g che-mcp-server

# Claude Code
claude mcp add che-mcp-server -- npx che-mcp-server
```

## Prerequisites

- **Runtime:** Node.js 18+
- **Kubernetes:** User's kubeconfig injected (standard in Eclipse Che)
- **Target workspaces:** tmux 3.1+ installed in the workspace image (most Ubuntu 22.04+ and UBI 9+ images include tmux 3.2+)

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CHE_MCP_TRANSPORT` | Transport mode: `stdio` or `http` | `stdio` |
| `CHE_MCP_PORT` | Port for HTTP transport | `8080` |
| `CHE_MCP_NAMESPACE` | Override namespace detection | (from kubeconfig) |

### CLI Flags

CLI flags override environment variables:

- `--transport <stdio|http>` — override `CHE_MCP_TRANSPORT`
- `--port <number>` — override `CHE_MCP_PORT`

### Namespace Detection

The server resolves the namespace in this order:

1. Kubeconfig context namespace
2. `CHE_MCP_NAMESPACE` environment variable
3. ServiceAccount namespace file (`/var/run/secrets/kubernetes.io/serviceaccount/namespace`)
4. `oc whoami` + Eclipse Che/DevSpaces suffix detection (`-che`, `-devspaces`)

## Tool Reference

### Workspace Lifecycle

| Tool | Description | Parameters |
|------|-------------|------------|
| `list_workspaces` | List all DevWorkspaces in the user namespace | None |
| `create_workspace` | Create a new DevWorkspace from the default empty template and start it | `name` (optional — auto-generated if omitted) |
| `start_workspace` | Start a stopped DevWorkspace | `workspace` (required) |
| `stop_workspace` | Stop a running DevWorkspace | `workspace` (required) |
| `delete_workspace` | Delete a DevWorkspace (regardless of state) | `workspace` (required) |

### Workspace Status

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_workspace_status` | Get detailed status (phase, conditions, URL, timestamps) | `workspace` (required) |
| `get_workspace_pod` | Get pod details (pod name, phase, container status) | `workspace` (required) |

### Agent Sessions

| Tool | Description | Parameters |
|------|-------------|------------|
| `launch_coding_agent` | Launch a coding agent in a workspace, starting the workspace if needed | `workspace`, `task` (required); `agent_type` (optional — `claude-code`, `opencode`, `gemini-cli`; default: `claude-code`); `system_prompt_file` (optional — path inside the target workspace to a system prompt file appended via `--append-system-prompt-file`; the file must already exist in the workspace filesystem; claude-code only) |
| `start_agent_session` | Start a tmux session with a coding agent in a workspace | `workspace`, `command` (required); `session_name`, `container` (optional) |
| `read_agent_output` | Capture recent terminal output from a tmux session | `workspace` (required); `session_name`, `lines`, `container` (optional) |
| `send_agent_input` | Send text to a tmux session | `workspace`, `text` (required); `session_name`, `enter`, `container` (optional) |
| `get_agent_state` | Check if tmux session and process are alive | `workspace` (required); `session_name`, `container` (optional) |
| `stop_agent_session` | Kill a tmux session | `workspace` (required); `session_name`, `container` (optional) |

## Usage Example

```
1. list_workspaces                         → find available workspaces
2. create_workspace { name: "test-ws" }    → create a new workspace
3. get_workspace_status { workspace: "test-ws" }  → wait until phase is Running
4. start_agent_session { workspace: "test-ws", command: "claude -p 'Add tests'" }
5. read_agent_output { workspace: "test-ws" }     → monitor progress
6. send_agent_input { workspace: "test-ws", text: "Yes" }  → respond to prompts
7. get_agent_state { workspace: "test-ws" }        → check if agent finished
8. stop_agent_session { workspace: "test-ws" }     → cleanup
9. stop_workspace { workspace: "test-ws" }         → stop when done
```

> **Tip:** Steps 3–4 can be replaced with `launch_coding_agent { workspace: "test-ws", task: "Add tests" }` — it waits for the workspace to start and launches the agent in one call.

## Container Deployment

### Build and push

```bash
make build && make image
make image-push

# Custom image and tag
IMAGE=myrepo/myimage TAG=v1 make image image-push
```

### Deploy to Kubernetes

```bash
kubectl apply -k deploy/ -n <namespace>
```

The server starts in HTTP mode on port 8080 with a health endpoint at `/healthz`.

## How It Works

The server is a stateless bridge between MCP clients and the Kubernetes API.

### Agent Sessions

Coding agent sessions use tmux inside target workspace pods. Each tool call creates a one-shot exec connection, runs a single tmux command, and closes. The tmux session persists independently.

- **Start:** `tmux new-session -d -s agent 'command'`
- **Read:** `tmux capture-pane -t agent -p`
- **Send:** `tmux send-keys -t agent -l 'text'` (literal mode prevents injection)
- **Check:** `tmux list-panes -t agent -F '#{pane_pid} #{pane_dead} #{pane_dead_status}'`
- **Stop:** `tmux kill-session -t agent`

Sessions use `remain-on-exit on` and 5000-line scrollback.

### Security

- The server only accesses the user's namespace from their kubeconfig context
- No cross-namespace operations
- The user's OAuth token limits operations to what they can do in the Che Dashboard
- All exec operations target the first non-`che-gateway` container (overridable with `container` parameter)

## License

Apache-2.0
