import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('192.168.132.132', username='nolimitnexus', password='123')
stdin, stdout, stderr = client.exec_command('echo 123 | sudo -S bash -c "sed -i \'s/3000:3000/3002:3000/g\' /home/nolimitnexus/steam_chatroom_dev/docker-compose.yml && cd /home/nolimitnexus/steam_chatroom_dev && docker compose up -d"')
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
client.close()
