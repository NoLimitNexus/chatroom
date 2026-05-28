import paramiko
import base64

# Get map from dev
dev = paramiko.SSHClient()
dev.set_missing_host_key_policy(paramiko.AutoAddPolicy())
dev.connect('192.168.132.132', username='nolimitnexus', password='123')
stdin, stdout, stderr = dev.exec_command('echo 123 | sudo -S docker exec steam_chatroom cat /data/map.json')
map_data = stdout.read().decode().strip()
# Filter out sudo password prompt line
lines = map_data.split('\n')
map_data = '\n'.join([l for l in lines if not l.startswith('Password:') and not l.startswith('[sudo]')])
dev.close()
print(f'DEV MAP: {len(map_data)} bytes')
print(f'Preview: {map_data[:200]}')

if not map_data or map_data == 'NO_MAP_FILE' or len(map_data) < 5:
    print('ERROR: No map data found on dev!')
    exit(1)

# Push map to prod NAS
prod = paramiko.SSHClient()
prod.set_missing_host_key_policy(paramiko.AutoAddPolicy())
prod.connect('192.168.50.141', username='nolimitnexus', password='3nchantinG')

b64 = base64.b64encode(map_data.encode()).decode()
cmd = f'echo 3nchantinG | sudo -S bash -c \'echo "{b64}" | base64 -d | /usr/local/bin/docker exec -i steam_chatroom tee /data/map.json > /dev/null\''
stdin, stdout, stderr = prod.exec_command(cmd)
stdout.read()
err = stderr.read().decode()
print(f'Push result: {err}')

# Verify
stdin, stdout, stderr = prod.exec_command('echo 3nchantinG | sudo -S /usr/local/bin/docker exec steam_chatroom cat /data/map.json')
verify = stdout.read().decode().strip()
print(f'VERIFY on NAS: {len(verify)} bytes')
print(f'Preview: {verify[:200]}')

# Restart container to pick up new map
stdin, stdout, stderr = prod.exec_command(f'echo 3nchantinG | sudo -S /usr/local/bin/docker restart steam_chatroom')
stdout.read()
print('Container restarted!')
prod.close()
print('Done! Map synced from dev -> NAS')
