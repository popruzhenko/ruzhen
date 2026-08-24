# SSL Setup Notes

This document describes the planned SSL setup for Ruzhen production deployment.

SSL certificates will be issued with Certbot and Let’s Encrypt.

Certbot is a tool that requests and renews SSL certificates. Let’s Encrypt is a free certificate authority that provides HTTPS certificates for domains.

## Domains

Ruzhen production will use:

```txt
ruzhen.org
www.ruzhen.org
api.ruzhen.org
```

## Goal

The goal is to make the production application available through HTTPS:

```txt
https://ruzhen.org
https://www.ruzhen.org
https://api.ruzhen.org
```

## Requirements

Before issuing SSL certificates:

- DNS A records must point to the VPS IP address
- ports `80` and `443` must be open on the VPS
- Docker must be installed on the VPS
- Docker Compose must be installed on the VPS
- production environment variables must be configured
- Nginx must be able to serve the Certbot webroot challenge path

## How certificate validation works

Let’s Encrypt needs to verify that the server controls the requested domain.

For the webroot challenge, Certbot creates temporary files inside:

```txt
/var/www/certbot
```

Nginx must expose these files through:

```txt
http://ruzhen.org/.well-known/acme-challenge/
http://api.ruzhen.org/.well-known/acme-challenge/
```

If Let’s Encrypt can reach these files, it issues the certificate.

## Certbot volumes

The production Docker Compose setup should use two shared folders:

```txt
certbot/www
certbot/conf
```

Purpose:

```txt
certbot/www
→ temporary challenge files

certbot/conf
→ issued SSL certificates
```

Nginx reads certificates from:

```txt
/etc/letsencrypt
```

Certbot writes certificates to the same location through a shared Docker volume.

## Initial certificate issuing

Certificates should be issued on the VPS after DNS records are configured.

### Frontend certificate

```bash
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  -d ruzhen.org \
  -d www.ruzhen.org \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email
```

### API certificate

```bash
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  -d api.ruzhen.org \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email
```

Replace:

```txt
your-email@example.com
```

with the real production email address.

## Reload Nginx after issuing certificates

After certificates are issued, restart Nginx:

```bash
docker compose -f docker-compose.prod.yml restart nginx
```

## Certificate renewal

Let’s Encrypt certificates expire and must be renewed.

Manual renewal command:

```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml restart nginx
```

Later, renewal should be automated with cron.

Cron means a scheduled server task that runs commands automatically at a configured time.

## Important deployment note

The final HTTPS Nginx configuration requires certificate files to already exist.

Before the first certificate is issued, Nginx may fail to start if it tries to load missing files:

```txt
/etc/letsencrypt/live/ruzhen.org/fullchain.pem
/etc/letsencrypt/live/ruzhen.org/privkey.pem
/etc/letsencrypt/live/api.ruzhen.org/fullchain.pem
/etc/letsencrypt/live/api.ruzhen.org/privkey.pem
```

Because of that, the first VPS setup should follow this order:

```txt
1. Configure DNS records
2. Start HTTP-only Nginx configuration
3. Issue certificates with Certbot
4. Switch to HTTPS Nginx configuration
5. Restart Nginx
```

## Future improvement

Later, SSL renewal can be automated with a VPS cron job:

```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml restart nginx
```

This will keep HTTPS certificates valid without manual renewal.
