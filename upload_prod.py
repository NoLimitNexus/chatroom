import os
import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('192.168.50.141', username='nolimitnexus', password='3nchantinG')

sftp = client.open_sftp()

files_to_upload = [
    'server.js',
    'public/client.js',
    'public/index.html',
    'public/studio.html',
    'public/editor.html',
    'public/editor.js'
]

remote_dir = '/var/services/homes/nolimitnexus/steam_chatroom'

for file in files_to_upload:
    local_path = os.path.join(os.getcwd(), file)
    remote_path = f"{remote_dir}/{file.replace('\\\\', '/')}"
    print(f"Uploading {local_path} -> {remote_path}")
    sftp.put(local_path, remote_path)

sftp.close()

# Rebuild the docker container
stdin, stdout, stderr = client.exec_command(f'echo 3nchantinG | sudo -S bash -c "cd {remote_dir} && docker compose up -d --build"')
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
client.close()
