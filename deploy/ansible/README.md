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
- `playbooks/`
  Entry-point playbooks.
- `roles/splash_zero_serial/`
  Tasks, defaults, and templates for installing `splash-serial` on
  `splash-zero`.

Example usage:

```bash
ansible-playbook -i deploy/ansible/inventory/splash-zero.example.ini \
  deploy/ansible/playbooks/splash-zero.yml
```
