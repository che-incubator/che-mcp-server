# Create Workspace with Repository Clone

Add optional git repository cloning to `create_workspace` so that a workspace starts with a project already checked out.

## Parameters

Two new optional parameters on `create_workspace`:

| Parameter  | Type   | Required | Description                                      |
|------------|--------|----------|--------------------------------------------------|
| `repo_url` | string | no       | Git repository URL to clone into the workspace   |
| `branch`   | string | no       | Branch or revision to check out (requires `repo_url`) |

Validation: passing `branch` without `repo_url` is an error.

## DevWorkspace Spec Change

When `repo_url` is provided, a `projects` array is added to `spec.template` alongside the existing `components`:

```yaml
spec:
  template:
    projects:
      - name: "my-app"
        git:
          remotes:
            origin: "https://github.com/org/my-app"
          checkoutFrom:              # only present if branch is provided
            revision: "feature-branch"
    components:
      - name: dev
        container: ...               # unchanged
```

The DevWorkspace operator clones the repo to `/projects/<name>` on startup.

### Project Name Derivation

The project name is extracted from the last path segment of the URL, with `.git` suffix stripped:

| URL                                      | Project name |
|------------------------------------------|-------------|
| `https://github.com/org/my-app.git`      | `my-app`    |
| `https://github.com/org/my-app`          | `my-app`    |
| `https://gitlab.com/group/sub/repo.git`  | `repo`      |
| `https://github.com/org/my-app/`        | `my-app`    |

## Tool Registration

In `tools.ts`, add two zod parameters to the `create_workspace` tool:

```ts
repo_url: z.string().url().optional()
  .describe('Git repository URL to clone into the workspace')
branch: z.string().optional()
  .describe('Branch or revision to check out (requires repo_url)')
```

The tool description remains unchanged.

## Files Changed

- `src/tools/create-workspace.ts` — add `repo_url` and `branch` to params interface, build `projects` array when `repo_url` is present, validate `branch` requires `repo_url`
- `src/tools.ts` — add `repo_url` and `branch` zod params to tool registration, pass them through to `createWorkspace`
- `tests/tools/create-workspace.test.ts` — new test cases

## Testing

- `create_workspace` with `repo_url` only: verify `projects` array in created body with correct name derivation
- `create_workspace` with `repo_url` + `branch`: verify `checkoutFrom.revision` is present
- `branch` without `repo_url`: verify it throws an error
- Project name derivation: URLs with/without `.git` suffix, trailing slashes

## What Does Not Change

- Container image, resources, endpoints
- Tool injection flow
- Start patch (`spec.started: true`)
- Return type (`{ name, started, tools_injected }`)
- Behavior when `repo_url` is omitted (identical to current)
