# Setup splash-relay

- Install Raspian
- Update Raspian

`sudo apt update
sudo apt upgrade`

- Install docker (https://pimylifeup.com/raspberry-pi-docker/)

`curl -sSL https://get.docker.com | sh`

- Install splash-relay

`docker pull ghcr.io/devinrader/splash-relay:latest`

`docker run ghcr.io/devinrader/splash-relay:latest`

- Install watchtower (https://containrrr.dev/watchtower/)
Automatically update splash-relay container.  Only use on dev system.

docker run -d \
--name watchtower \
-v /var/run/docker.sock:/var/run/docker.sock \
containrrr/watchtower ghcr.io/devinrader/splash-relay


