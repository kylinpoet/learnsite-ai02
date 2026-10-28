import sqlite3

conn = sqlite3.connect('learnsite.db')
cur = conn.cursor()
cur.execute("SELECT username, password_hash FROM users WHERE username IN ('admin', 't1', 't2')")
rows = dict(cur.fetchall())
for name, h in rows.items():
    print(name, '=>', h[:60], '... len=', len(h))

# 离线校验 222221 是否匹配 admin 的旧格式哈希
import hashlib, hmac

h = rows.get('admin', '')
if ':' in h:
    salt_hex, digest_hex = h.split(':', maxsplit=1)
    for candidate in ('222221', '123456', 'admin', '12345'):
        digest = hashlib.pbkdf2_hmac('sha256', candidate.encode('utf-8'), bytes.fromhex(salt_hex), 120_000)
        print(candidate, '=>', hmac.compare_digest(digest.hex(), digest_hex))
else:
    print('admin hash is not legacy format')
