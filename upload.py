import os
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('192.168.132.132', username='nolimitnexus', password='123')

sftp = client.open_sftp()

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
    'public/ripples.js'
]

remote_dir = '/home/nolimitnexus/steam_chatroom_dev'

for file in files_to_upload:
    local_path = os.path.join(os.getcwd(), file)
    if not os.path.exists(local_path):
        print(f"SKIP (not found): {local_path}")
        continue
    remote_path = f"{remote_dir}/{file.replace(chr(92), '/')}"
    print(f"Uploading {local_path} -> {remote_path}")
    sftp.put(local_path, remote_path)

# Write .env for dev (port 3002)
with sftp.open(f"{remote_dir}/.env", 'w') as f:
    f.write("HOST_PORT=3002\nNODE_ENV=development\n")
print("Wrote .env (HOST_PORT=3002)")

sftp.close()

# Rebuild the docker container
stdin, stdout, stderr = client.exec_command(f'echo 123 | sudo -S bash -c "cd {remote_dir} && docker compose up -d --build"')
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
client.close()
