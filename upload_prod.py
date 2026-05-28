import os
import base64
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('192.168.50.141', username='nolimitnexus', password='3nchantinG')

files_to_upload = [
    'docker-compose.yml',
    'Dockerfile',
    '.dockerignore',
    'package.json',
    'package-lock.json',
    'server.js',
    'public/client.js',
    'public/index.html',
    'public/style.css',
    'public/studio.html',
    'public/editor.html',
    'public/editor.js',
    'public/ObjectFactory.js',
    'public/campfire.js',
    'public/ripples.js',
    'public/shared-environment.js',
    'public/shared-characters.js'
]

remote_dir = '/var/services/homes/nolimitnexus/steam_chatroom'

# Ensure public dir exists
client.exec_command(f'mkdir -p {remote_dir}/public')

for file in files_to_upload:
    local_path = os.path.join(os.getcwd(), file)
    if not os.path.exists(local_path):
        print(f"SKIP (not found): {file}")
        continue
    with open(local_path, 'rb') as f:
        content = base64.b64encode(f.read()).decode()
    remote_path = f"{remote_dir}/{file}"
    # Write file via base64 decode over SSH
    cmd = f'echo "{content}" | base64 -d > {remote_path}'
    stdin, stdout, stderr = client.exec_command(cmd)
    stdout.read()  # wait for completion
    err = stderr.read().decode().strip()
    if err:
        print(f"ERR {file}: {err}")
    else:
        print(f"OK: {file}")

# Write .env for prod (port 3000, behind Cloudflare tunnel)
client.exec_command(f'echo "HOST_PORT=3000\nNODE_ENV=production" > {remote_dir}/.env')
print("Wrote .env (HOST_PORT=3000)")

# Rebuild the docker container (use full path for Synology)
print("\nRebuilding container...")
stdin, stdout, stderr = client.exec_command(f'echo 3nchantinG | sudo -S bash -c "cd {remote_dir} && /usr/local/bin/docker compose up -d --build"')
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
client.close()
print("Done!")
