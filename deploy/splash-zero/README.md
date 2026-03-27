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
