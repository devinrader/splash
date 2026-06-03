# Ansible Deployment Assets

This directory contains the initial Ansible automation for Splash host
deployment.

Preferred direction:

- deploy and configure `splash-core` services as independent Docker containers
  managed by Ansible roles and playbooks
- avoid relying on a host-resident Docker Compose file as the primary
  deployment contract for `splash-core`

Current scope:

- `splash-zero` package consumption for `splash-serial`
- Gitea Debian registry source configuration
- managed `/etc/splash/splash-serial.env`
- `systemd` enablement for `splash-serial`
- `splash-core` SQLite file provisioning for `splash-api` on `automa`

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
- `roles/splash_core_sqlite/`
  Tasks and defaults for provisioning the persistent SQLite file and backup
  directories used by `splash-api` on `splash-core`.

Variable model:

- put non-secret host defaults in `group_vars/splash_zero/*.yml`
- keep registry credentials and any other sensitive overrides in
  `group_vars/splash_zero/vault.yml`
- encrypt `vault.yml` with Ansible Vault in real use
- keep `splash_serial_package_arch` aligned with the published package architecture; for the current `splash-serial` Debian package this should stay `armhf` even when the target host runs an `arm64` userspace
- by default the role tracks the latest published `splash-serial` package; set `splash_serial_package_version` when you want a pinned rollout instead
- the initial `splash-core` SQLite role is independently deployable:
  it creates the persistent data directory, the SQLite database file, and a
  local backup directory for file-based relational backups

Typical local preparation:

```bash
cp deploy/ansible/group_vars/splash_zero/main.example.yml \
  deploy/ansible/group_vars/splash_zero/main.yml
cp deploy/ansible/group_vars/splash_zero/vault.example.yml \
  deploy/ansible/group_vars/splash_zero/vault.yml
cp deploy/ansible/group_vars/splash_core/main.example.yml \
  deploy/ansible/group_vars/splash_core/main.yml
ansible-vault encrypt deploy/ansible/group_vars/splash_zero/vault.yml
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
  deploy/ansible/playbooks/splash-core-sqlite.yml
```
