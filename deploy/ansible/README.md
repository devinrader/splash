# Ansible Deployment Assets

This directory contains the initial Ansible automation for Splash host
deployment.

Current scope:

- `splash-zero` package consumption for `splash-serial`
- Gitea Debian registry source configuration
- managed `/etc/splash/splash-serial.env`
- `systemd` enablement for `splash-serial`
- `splash-core` PostgreSQL deployment on `automa` via Docker Compose

Layout:

- `inventory/`
  Example inventory files.
- `group_vars/`
  Example host-group variables and vault placeholders.
- `playbooks/`
  Entry-point playbooks.
- `roles/splash_zero_serial/`
  Tasks, defaults, and templates for installing `splash-serial` on
  `splash-zero`.
- `roles/splash_core_postgres/`
  Tasks, defaults, and templates for running `splash-postgres` on
  `splash-core`.

Variable model:

- put non-secret host defaults in `group_vars/splash_zero/*.yml`
- keep registry credentials and any other sensitive overrides in
  `group_vars/splash_zero/vault.yml`
- encrypt `vault.yml` with Ansible Vault in real use
- keep `splash_serial_package_arch` aligned with the published package architecture; for the current `splash-serial` Debian package this should stay `armhf` even when the target host runs an `arm64` userspace
- by default the role tracks the latest published `splash-serial` package; set `splash_serial_package_version` when you want a pinned rollout instead
- keep PostgreSQL credentials in `group_vars/splash_core/vault.yml`
- the initial `splash-core` Postgres role publishes the database only on
  `127.0.0.1:5432` so it remains internal to the host

Typical local preparation:

```bash
cp deploy/ansible/group_vars/splash_zero/main.example.yml \
  deploy/ansible/group_vars/splash_zero/main.yml
cp deploy/ansible/group_vars/splash_zero/vault.example.yml \
  deploy/ansible/group_vars/splash_zero/vault.yml
cp deploy/ansible/group_vars/splash_core/main.example.yml \
  deploy/ansible/group_vars/splash_core/main.yml
cp deploy/ansible/group_vars/splash_core/vault.example.yml \
  deploy/ansible/group_vars/splash_core/vault.yml
ansible-vault encrypt deploy/ansible/group_vars/splash_zero/vault.yml
ansible-vault encrypt deploy/ansible/group_vars/splash_core/vault.yml
```

Example usage:

```bash
ANSIBLE_CONFIG=deploy/ansible/ansible.cfg \
ANSIBLE_LOCAL_TEMP=/tmp/ansible-local \
ansible-playbook -i deploy/ansible/inventory/splash-zero.ini \
  deploy/ansible/playbooks/splash-zero.yml

ANSIBLE_CONFIG=deploy/ansible/ansible.cfg \
ANSIBLE_LOCAL_TEMP=/tmp/ansible-local \
ansible-playbook -i deploy/ansible/inventory/splash-core.ini \
  deploy/ansible/playbooks/splash-core-postgres.yml
```
