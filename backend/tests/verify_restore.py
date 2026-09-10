"""Compare real restored database rows and S3 bytes; never prints their content."""
import os,json,time,hashlib
import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
import boto3
from botocore.config import Config
from farm import storage


def run():
    restored=make_conninfo(os.environ['DATABASE_URL'],dbname=os.environ['TEST_RESTORE_DB'])
    with psycopg.connect(os.environ['DATABASE_URL']) as original,psycopg.connect(restored) as copy:
        tables=[r[0] for r in original.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")]
        for name in tables:
            # Canonical row multiset, including all references and checkpoint payloads.
            query=sql.SQL('SELECT row_to_json(t)::text FROM {} t ORDER BY row_to_json(t)::text').format(sql.Identifier(name))
            a=original.execute(query).fetchall();b=copy.execute(query).fetchall()
            assert a==b,'Restored table differs: '+name
        keys=[r[0] for r in copy.execute('SELECT object_key FROM artifacts')]
    source=storage.client()
    target=boto3.client('s3',endpoint_url=os.environ['TEST_RESTORE_STORAGE'],aws_access_key_id=os.environ['S3_ACCESS_KEY'],aws_secret_access_key=os.environ['S3_SECRET_KEY'],config=Config(connect_timeout=3,read_timeout=5,retries={'max_attempts':1}))
    for attempt in range(20):
        try:target.head_bucket(Bucket=storage.bucket());break
        except Exception:
            if attempt==19:raise
            time.sleep(.5)
    for key in keys:
        a=source.get_object(Bucket=storage.bucket(),Key=key)['Body'].read()
        b=target.get_object(Bucket=storage.bucket(),Key=key)['Body'].read()
        assert hashlib.sha256(a).digest()==hashlib.sha256(b).digest(),'Restored object differs'
    print(json.dumps({'restored_tables':len(tables),'restored_artifacts':len(keys),'row_equality':True,'sha256_equality':True}))


if __name__=='__main__':run()
