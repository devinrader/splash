# CI Runner Usage

[Back to Splash Protocol Service](./README.md)

## Purpose

This document defines the Gitea Actions and runner assumptions required for
`splash-protocol` no-hardware CI.

These are manual platform and runner configuration expectations outside the
application codebase.

## Target runner label

`splash-protocol` CI jobs should target a dedicated runner label:

- `splash-protocol-ci`

Recommended runner-label mapping:

```text
splash-protocol-ci:docker://ghcr.io/catthehacker/ubuntu:act-22.04
```

Reason:

- keeps protocol replay and integration jobs off generic labels
- makes the workflow intent explicit
- avoids coupling protocol CI to a floating `latest` image

## Required runner-image behavior

The runner image used for `splash-protocol` CI must support:

- Linux container execution
- Node.js runtime or a workflow-installed Node.js toolchain
- loopback networking inside the container
- execution of the compiled TypeScript or Node.js test runtime
- in-process or sidecar NATS for integration coverage

Explicitly not required:

- PTY access
- `/dev/ttyUSB*`
- privileged container mode
- physical RS-485 hardware

## Required image contents

The job image should contain, or the workflow should install:

- Node.js
- `npm` or `pnpm`
- `bash`
- `coreutils`
- `procps`
- `ca-certificates`

Optional but recommended:

- `jq`
- `curl`

## Gitea Actions workflow guidance

### Recommended job split

- `unit`
  - plugin library tests
  - protocol core library tests
  - fake timers and fixture-based decode or encode tests
- `integration`
  - live NATS subject flow through the real service runtime
  - degraded startup with NATS unavailable
  - stream reset and command-correlation behavior
- `replay`
  - recorded or synthetic frame fixtures
  - malformed-frame and checksum-failure cases
- `build`
  - package or container-image artifact construction

## NATS test harness guidance

Preferred order:

1. in-process NATS or lightweight test-container startup inside the job
2. sidecar `nats:2` container when closer deployment parity is useful

For the initial `splash-protocol` CI path, either in-process or sidecar NATS is
acceptable because PTY and hardware access are not required.

## Build expectations

CI should validate that `splash-protocol` can produce the deployment artifact
shape intended for `splash-core`.

Current deployment-design expectation:

- the service package should be suitable for embedding into the `splash-core`
  Compose-managed runtime

ASSUMPTION: the exact packaging format for the first `splash-protocol` artifact
will be decided during implementation planning, but CI must validate a
repeatable build output before deployment work is considered complete.

## Manual runner-side setup expectations

Outside the repository, the platform operator should:

1. add the `splash-protocol-ci` label to the runner configuration
2. map it to a validated Ubuntu-based container image
3. restart the runner after label changes
4. verify the label appears in the Gitea UI
5. keep `/var/run/docker.sock` mounted into the runner container if the workflow
   uses sidecar containers or build steps requiring Docker
