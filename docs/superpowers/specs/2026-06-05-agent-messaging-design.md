# Agent-to-Agent Messaging Design

## Context

The supervisor-worker protocol currently relies on the supervisor pushing files (brief.md, protocol files) into worker workspaces via MCP tool calls. This is fragile — the LLM forgets steps, gets paths wrong, and file deployment via `exec_in_workspace` fails silently. Recent failures include: protocol file not found, working directory missing because repo wasn't cloned, and workers starting with no brief.

The root cause: deterministic mechanical steps are encoded as prompt instructions for a probabilistic LLM to execute. The fix is to flip the model — workers **pull** what they need via messages instead of the supervisor **pushing** files.

This design adds peer-to-peer messaging between agents via two new MCP tools in che-mcp-server. Messages are stored in-memory, delivered asynchronously, and consumed on read. The confirmation-based protocol pattern (from the API-recharged research) informs the request-response semantics: agents send intent, receive structured confirmations, then act.

## Design

### MCP Tools

Two new tools:

**`send_message`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| from | string | yes | Sender's session_id |
| to | string | yes | Recipient's session_id |
| body | string | yes | Message content |
| thread_id | string | no | Groups related messages. Auto-generated UUID if omitted. |

Returns: `{ message_id: string, thread_id: string }`

**`receive_messages`**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| session_id | string | yes | Whose inbox to read |
| thread_id | string | no | Filter by thread |

Returns:
```json
{
  "messages": [
    {
      "message_id": "uuid",
      "from": "agent-abc123",
      "to": "agent-def456",
      "body": "task brief content...",
      "thread_id": "uuid",
      "timestamp": "2026-06-05T10:30:00Z"
    }
  ]
}
```

Messages are **consumed on read** — calling `receive_messages` returns and removes messages from the inbox. If filtered by `thread_id`, only matched messages are removed.

**Existing tool modification:**

`get_agent_status` response gains an `unread_messages: number` field. This is a non-destructive count — monitors can see pending messages without consuming them.

### Message Store

In-memory store inside the che-mcp-server process:

```typescript
const inboxes = new Map<string, Message[]>();

interface Message {
  message_id: string;
  from: string;
  to: string;
  body: string;
  thread_id: string;
  timestamp: string;
}
```

**Behavior:**
- `send_message` → appends to `inboxes.get(to)` (creates array if first message)
- `receive_messages` → returns and deletes all messages for that session_id (or filtered by thread_id, deleting only matched)
- `get_agent_status` → reads `inboxes.get(session_id)?.length ?? 0` for the `unread_messages` field (no mutation)

**Lifecycle:**
- Messages persist until read or server restart
- No TTL, no max queue size for v1
- Server restart clears all inboxes (acceptable — workspace restarts clear agent state anyway)

**Addressing:**
- Agents are addressed by `session_id` (e.g., `agent-abc123`)
- The supervisor is just another agent with a known session_id
- An agent can send to any session_id across any workspace — the store is global, not workspace-scoped

### Worker Startup Flow (Pull Model)

Old flow (push — fragile):
```
Supervisor: clone repo → create dirs → write brief.md → deploy protocol → launch_coding_agent
Worker: read brief.md → start working
```

New flow (pull — robust):
```
Supervisor: launch_coding_agent(workspace, session_id,
            task: "you are a worker, your supervisor is <supervisor-session-id>,
                   request your task assignment via send_message")

Worker: send_message(from: me, to: supervisor, body: "ready, requesting task assignment")
Worker: ... waits, polls receive_messages ...
Worker: receive_messages(session_id: me) → gets task brief + context
Worker: start working
Worker: ... gets blocked ...
Worker: send_message(from: me, to: supervisor, body: "blocked: which test framework?")
Worker: ... continues other sub-tasks or waits ...
Worker: receive_messages(session_id: me) → gets answer
Worker: ... finishes ...
Worker: send_message(from: me, to: supervisor, body: "done, result at /projects/.agent/...")
```

The supervisor's `launch_coding_agent` task becomes minimal — just identity and who to talk to. All context is pulled on demand.

### Supervisor Monitoring

The supervisor's existing control loop gains message handling:

```
Supervisor control loop (every 2 min):
  for each active worker:
    status = get_agent_status(workspace, session_id)

    if status.unread_messages > 0:
      msgs = receive_messages(session_id: supervisor_session_id,
                              thread_id: worker's thread)
      for each msg:
        → task request? respond with brief + context
        → blocked question? decide and respond
        → done notification? collect results

    if status.phase == "lost":
      handle failure

    if status.phase == "finished" && unread_messages == 0:
      mark worker complete
```

No separate polling loop — messages surface during existing status checks.

### Notification Mechanism

Agents discover new messages via `get_agent_status` which includes `unread_messages` count. No terminal injection or push notification. The agent (or its monitor) polls status and calls `receive_messages` when `unread_messages > 0`.

### Files Changed

**New files:**
- `src/messaging/store.ts` — in-memory message store (Map + Message interface)
- `src/tools/send-message.ts` — send_message tool handler (new tool, separate from existing `send-message-to-agent.ts`)
- `src/tools/receive-messages.ts` — receive_messages tool handler
- `tests/messaging/store.test.ts` — store unit tests
- `tests/tools/send-message.test.ts` — send_message tool tests
- `tests/tools/receive-messages.test.ts` — receive_messages tool tests

**Modified files:**
- `src/tools.ts` — register both tools with Zod schemas
- `src/orchestrator/index.ts` — add `unread_messages` to `getAgentStatus` response

### Backward Compatibility

- Existing `send_message_to_agent` tool is kept — it still does terminal injection, which is useful for ad-hoc commands to running agents
- New `send_message` is a separate tool with different semantics (inbox-based, not terminal input)
- `get_agent_status` gains one field (`unread_messages`) — additive, non-breaking
- All existing tools unchanged

### What Does NOT Change

- `launch_coding_agent` — still launches agents the same way
- `exec_in_workspace` — still available for direct commands
- Session management (annotations) — unchanged
- Worker protocol / supervisor protocol — updated in a follow-up spec, not this implementation

### Dependencies

- No external dependencies — uses Node.js built-in Map
- No database, no Redis, no K8s annotations for messages
- Only che-mcp-server process memory
