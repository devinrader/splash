# Splash Zero Deployment Assets

This directory contains the package-oriented runtime assets for deploying
`splash-serial` to `splash-zero` in alignment with the documented host model.

Included assets:

- `splash-serial.service`
  `systemd` unit installed by the Debian package.
- `splash-serial.env.example`
  Example runtime configuration file installed as
  `/etc/splash/splash-serial.env`.
- `debian/`
  Debian package metadata and maintainer scripts.
- `build-splash-serial-deb.sh`
  Helper for cross-compiling the Go binary for `linux/arm/v7`, staging the
  package filesystem, and building a Debian package when `dpkg-deb` is
  available.
- `gitea-splash-packages.list.example`
  Example apt source entry for consuming the Gitea Debian registry.

Expected target host layout:

- binary: `/usr/bin/splash-serial`
- env file: `/etc/splash/splash-serial.env`
- unit file: `/lib/systemd/system/splash-serial.service`

Build outputs:

- `build/pkgroot/`
  Staged Debian package filesystem tree.
- `dist/`
  Generated `.deb` artifact when `dpkg-deb` is available.

Typical usage:

```bash
./deploy/splash-zero/build-splash-serial-deb.sh 0.1.0
```

Staging-only usage when `dpkg-deb` is not installed locally:

```bash
./deploy/splash-zero/build-splash-serial-deb.sh 0.1.0 --stage-only
```

## Installing From The Gitea Debian Registry

Manual host setup follows the Gitea Debian registry model:

1. Install the registry signing key into `/etc/apt/keyrings/`
2. Add an apt source entry for the `devinrader` Debian registry
3. Run `apt update`
4. Install a stable or prerelease `splash-serial` package version

Example source entry:

```bash
deb [signed-by=/etc/apt/keyrings/gitea-devinrader.asc] https://gitea.rader.haus/api/packages/devinrader/debian bookworm main
```

If the registry requires authentication for install, include credentials in the
apt source URL or let future Ansible automation render a credential-aware source
file.

Example manual setup commands:

```bash
sudo mkdir -p /etc/apt/keyrings
sudo curl --fail --silent --show-error \
  https://gitea.rader.haus/api/packages/devinrader/debian/repository.key \
  -o /etc/apt/keyrings/gitea-devinrader.asc
echo "deb [signed-by=/etc/apt/keyrings/gitea-devinrader.asc] https://gitea.rader.haus/api/packages/devinrader/debian bookworm main" \
  | sudo tee /etc/apt/sources.list.d/gitea-devinrader.list
```

Example install flow after the repository is configured:

```bash
sudo apt update
apt-cache policy splash-serial
sudo apt install splash-serial
sudo apt install splash-serial=0.0.0~main.20260328002517+9d25f97
```

The live `/etc/splash/splash-serial.env` file remains environment-specific and
should be managed by Ansible in the intended production workflow.
