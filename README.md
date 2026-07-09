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

### Local (connecting to a remote cluster)

Connect to the MCP server from your local machine using the stdio bridge. It manages `oc port-forward` internally — auto-starts, monitors, and restarts on failure. Requires `oc login` to the target cluster.

```bash
# Via npx (no install needed)
claude mcp add che-mcp -- npx --package che-mcp-server che-mcp-bridge

# Or install globally
npm install -g che-mcp-server
claude mcp add che-mcp -- che-mcp-bridge
```

Configuration via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_NAMESPACE` | Kubernetes namespace | Current `oc project` |
| `MCP_SERVICE` | Service name | `che-mcp-server` |
| `MCP_PORT` | Service port | `8080` |

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
| `list_workspaces` | List all DevWorkspaces in the user namespace | `limit`, `offset` (optional) |
| `create_workspace` | Create a new DevWorkspace and start it | `name` (optional); `repo_url` (optional — git repo to clone); `branch` (optional — requires `repo_url`); `tools` (optional — array of tools to pre-install: `claude-code`, `opencode`, `goose`, `kilocode`, `gemini-cli`, `tmux`, `python3`) |
| `start_workspace` | Start a stopped DevWorkspace | `workspace` (required) |
| `stop_workspace` | Stop a running DevWorkspace (preserves data) | `workspace` (required) |
| `delete_workspace` | Delete a DevWorkspace permanently | `workspace` (required) |

### Workspace Status

| Tool | Description | Parameters |
|------|-------------|------------|
| `get_workspace_status` | Get phase, conditions, URL, and timestamps | `workspace` (required) |
| `get_workspace_pod` | Get pod name, phase, and per-container status | `workspace` (required) |

### Agent Sessions

| Tool | Description | Parameters |
|------|-------------|------------|
| `launch_coding_agent` | Launch a coding agent, starting the workspace if needed | `workspace`, `task` (required); `agent_type` (optional — `claude-code`, `opencode`, `gemini-cli`); `system_prompt_file` (optional — path inside workspace, claude-code only) |
| `get_agent_status` | Get agent phase (running/finished/lost/idle) and last output | `workspace` (required) |
| `list_all_agents` | List all workspaces with active or past agent sessions | `limit`, `offset` (optional) |
| `send_message_to_agent` | Send a message to a running agent via terminal input | `workspace`, `message` (required) |
| `get_agent_output` | Read recent terminal output from an agent session | `workspace` (required); `lines` (optional) |
| `stop_agent` | Stop an agent session and return completion summary | `workspace` (required) |
| `inject_tool` | Inject an AI tool into a running workspace (requires restart) | `workspace`, `tool` (required) |

### Terminal Sessions (full mode only)

These tools are available when the server runs with `--transport http` (full mode). They provide direct tmux access for advanced use cases.

| Tool | Description | Parameters |
|------|-------------|------------|
| `start_terminal_session` | Start a bash tmux session in a workspace | `workspace` (required); `session_name`, `container` (optional) |
| `read_terminal_output` | Capture recent output from a tmux session | `workspace` (required); `session_name`, `lines`, `container` (optional) |
| `send_terminal_input` | Send text to a tmux session | `workspace`, `text` (required); `session_name`, `enter`, `container` (optional) |
| `get_terminal_state` | Check if tmux session and process are alive | `workspace` (required); `session_name`, `container` (optional) |
| `stop_terminal_session` | Kill a tmux session | `workspace` (required); `session_name`, `container` (optional) |
| `exec_in_workspace` | Run a shell command and return output | `workspace`, `command` (required); `timeout_seconds`, `session_name`, `container` (optional) |

### Messaging

| Tool | Description | Parameters |
|------|-------------|------------|
| `send_message` | Send a message to another agent's inbox | `from`, `to`, `body` (required); `thread_id` (optional) |
| `receive_messages` | Read and consume messages from an inbox | `session_id` (required); `thread_id` (optional) |

## Usage Example

```
1. list_workspaces                         → find available workspaces
2. create_workspace { name: "test-ws" }    → create a new workspace
3. get_workspace_status { workspace: "test-ws" }  → wait until phase is Running
4. launch_coding_agent { workspace: "test-ws", task: "Add tests" }
5. get_agent_output { workspace: "test-ws" }       → monitor progress
6. send_message_to_agent { workspace: "test-ws", message: "Yes" }  → respond to prompts
7. get_agent_status { workspace: "test-ws" }       → check if agent finished
8. stop_agent { workspace: "test-ws" }             → cleanup
9. stop_workspace { workspace: "test-ws" }         → stop when done
```

> **Tip:** `launch_coding_agent` (step 4) handles waiting for the workspace to start and launches the agent in one call — no need to poll `get_workspace_status` separately.

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
