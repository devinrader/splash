# CI Runner Usage

[Back to Splash Serial Service](./README.md)

## Purpose

This document defines the Gitea Actions and runner assumptions required for `splash-serial` no-hardware CI.

These are manual platform and runner configuration expectations outside the application codebase.

## Target runner label

`splash-serial` CI jobs should target a dedicated runner label:

- `splash-serial-ci`

Recommended runner-label mapping:

```text
splash-serial-ci:docker://ghcr.io/catthehacker/ubuntu:act-22.04
```

Reason:

- keeps PTY-dependent tests off generic labels
- makes the workflow intent explicit
- avoids coupling `splash-serial` CI to a floating `latest` image

## Temporary override

The repository is temporarily using `ubuntu-latest` in
`.gitea/workflows/splash-serial.yaml` so `splash-serial` CI can run before the
dedicated runner is provisioned.

This is an explicit temporary override of the preferred runner design.

Track restoration of the dedicated runner path as a `v.next` enhancement in:

- Gitea issue `#28` `Feature Enhancement: Restore dedicated splash-serial-ci runner (v.next)`

## Required runner-image behavior

The runner image used for `splash-serial` CI must support:

- Linux container execution
- PTY support through `/dev/ptmx`
- `devpts` mounted in the job container
- loopback networking inside the container
- execution of the compiled Go test binary

The currently validated image family is:

- `ghcr.io/catthehacker/ubuntu:act-22.04`

## Required image contents

The job image should contain, or the workflow should install:

- Go toolchain
- `bash`
- `coreutils`
- `procps`
- `ca-certificates`

Explicitly not required:

- USB device access
- `/dev/ttyUSB*`
- privileged container mode
- physical RS-485 hardware

## Gitea Actions workflow guidance

### `runs-on`

Preferred end state for the PTY-backed integration job:

```yaml
runs-on:
  - splash-serial-ci
```

Preferred end state for the pure unit job:

```yaml
runs-on:
  - splash-serial-ci
```

or a more general Ubuntu label if the workflow intentionally separates PTY-dependent and PTY-independent jobs.

Temporary current state while `#28` remains deferred:

```yaml
runs-on: ubuntu-latest
```

This fallback is acceptable for the current delivery path while `#28` remains deferred.

### Avoid overriding the container image unintentionally

If the runner label already maps to the validated container image, the workflow should avoid overriding the container image unless the replacement image preserves the same PTY and toolchain assumptions.

If a workflow-level `container:` block is added, it becomes the workflow author's responsibility to ensure that image still provides:

- `/dev/ptmx`
- `devpts`
- required shell and process utilities
- Go toolchain or installation path

### Recommended job split

- `unit`
  - fake port
  - fake clock
  - no PTY requirement
- `integration`
  - PTY-backed port emulation
  - isolated test NATS instance
  - hardware-free

## NATS test harness guidance

Preferred order:

1. in-process NATS via a Go test dependency
2. sidecar `nats:2` container if closer parity with deployment behavior is needed

For the initial `splash-serial` CI path, in-process NATS is preferred because it minimizes orchestration complexity inside Gitea Actions jobs.

## Manual runner-side setup expectations

Outside the repository, the platform operator should:

1. add the `splash-serial-ci` label to the runner configuration
2. map it to `ghcr.io/catthehacker/ubuntu:act-22.04`
3. restart the runner after label changes
4. verify the label appears in the Gitea UI
5. keep `/var/run/docker.sock` mounted into the runner container

## Validated assumptions

The current runner setup has validated:

- Docker-based `act_runner`
- Docker socket mounted into the runner container
- PTY support in `ghcr.io/catthehacker/ubuntu:act-22.04`

Those assumptions are sufficient for PTY-backed no-hardware `splash-serial` tests.
