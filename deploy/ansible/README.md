# Ansible Deployment Assets

This directory contains the initial Ansible automation for Splash host
deployment.

Current scope:

- `splash-zero` package consumption for `splash-serial`
- Gitea Debian registry source configuration
- managed `/etc/splash/splash-serial.env`
- `systemd` enablement for `splash-serial`

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

Variable model:

- put non-secret host defaults in `group_vars/splash_zero/*.yml`
- keep registry credentials and any other sensitive overrides in
  `group_vars/splash_zero/vault.yml`
- encrypt `vault.yml` with Ansible Vault in real use

Typical local preparation:

```bash
cp deploy/ansible/group_vars/splash_zero/main.example.yml \
  deploy/ansible/group_vars/splash_zero/main.yml
cp deploy/ansible/group_vars/splash_zero/vault.example.yml \
  deploy/ansible/group_vars/splash_zero/vault.yml
ansible-vault encrypt deploy/ansible/group_vars/splash_zero/vault.yml
```

Example usage:

```bash
ansible-playbook -i deploy/ansible/inventory/splash-zero.example.ini \
  deploy/ansible/playbooks/splash-zero.yml
```
