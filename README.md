# iSite crawler worker

The small service that runs your venue event crawlers (crawler-1.js … crawler-5.js) when the iSite hub asks, and hands the events back. It lives on its own Raspberry Pi so the hub Pi never has to run a browser.

## Set it up (new Pi, about 15 minutes)

0. **Node 22** on a fresh Pi: `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`
1. **Tailscale first.** Install it and join your network, then note this Pi's address: `tailscale ip -4`.
2. (Optional) the USB drive - see below.
3. Copy this whole folder to the Pi (for example into `~/isite-crawler-worker`), open a terminal there and run:
   ```
   bash setup-worker.sh
   ```
   It installs the virtual screen and the browser, writes a secret into `.env`, and starts the service (it starts on boot and restarts itself if it stops). Near the end it prints **two lines for the hub's `.env`**.
4. On the **hub Pi**, add those two lines to the hub's `.env`, plus these (your email is the admin; everyone else can run and download but not change categories):
   ```
   EVENTS_WORKER_URL=http://<this Pi's Tailscale address>:8900
   EVENTS_WORKER_TOKEN=<the long secret from step 3>
   HUB_ADMIN_EMAILS=tle@isitemediagroup.com
   EVENTS_SCHEDULE=mon 06:00
   ```
   (`EVENTS_SCHEDULE` is optional - leave it out for no automatic crawl. Several are allowed: `mon 06:00, thu 18:30`.) Then `sudo systemctl restart isite-hub`.

## Using a USB drive (optional, helps a little)
A USB drive adds storage, not memory, but it keeps the browser's temporary files and the worker's saved results off the SD card and out of RAM. Plug it into a **blue (USB 3) port**, then:
```
lsblk -f                                   # find it, usually /dev/sda1
sudo mkfs.ext4 -L events /dev/sda1         # ERASES the drive - check the name first!
sudo mkdir -p /mnt/events
echo 'LABEL=events /mnt/events ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
sudo mount -a && df -h /mnt/events         # should show the drive's size
bash setup-worker.sh --usb /mnt/events     # instead of plain  bash setup-worker.sh
```
`nofail` means a missing drive never stops the Pi from booting. If the drive is missing the service waits for it rather than quietly writing to the SD card. Swap stays on the SD card (it is a safety net, not a substitute for memory).

## Your crawler files
They are in the `crawlers/` folder. **To update one, just copy the new file over it** - no changes needed to your file, the worker adapts it by itself. You can keep running them in VS Code exactly as before. Which venue each scraper belongs to, and its category, is in `registry.json`; a new scraper you add to a file shows up on its own (under "Other") until you list it there.

## Everyday commands
```
sudo systemctl status isite-crawler-worker      is it running?
sudo journalctl -u isite-crawler-worker -f      watch what it is doing
sudo systemctl restart isite-crawler-worker     after changing .env
```

## If crawls fail with memory errors (this Pi has 2 GB)
- Lower `WORKER_CONCURRENCY` to `1` in `.env` (slower, safest), then restart the service.
- Make sure swap is 2 GB (the setup script tells you the command if it is not).
- The service is capped (1.5 GB) so a runaway crawl is stopped before it can freeze the Pi, and the worker waits for free memory before starting each scraper.

## Security
The worker answers only requests that carry the secret from `.env`, and the setup script binds it to the Tailscale address. Do not put the secret anywhere public.
