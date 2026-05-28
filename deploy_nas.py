import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('192.168.50.141', username='nolimitnexus', password='3nchantinG')
stdin, stdout, stderr = client.exec_command('echo 3nchantinG | sudo -S bash -c "cd /home/nolimitnexus/steam_chatroom && git pull && docker compose up -d --build"')
print(stdout.read().decode())
print(stderr.read().decode())
client.close()
