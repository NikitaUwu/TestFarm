import os
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def client():
    return boto3.client('s3', endpoint_url=os.environ['S3_ENDPOINT'],
                        aws_access_key_id=os.environ['S3_ACCESS_KEY'], aws_secret_access_key=os.environ['S3_SECRET_KEY'],
                        region_name='us-east-1', config=Config(connect_timeout=5, read_timeout=10, retries={'max_attempts': 2}, s3={'addressing_style': 'path'}))


def bucket():
    return os.getenv('S3_BUCKET', 'farm')


def ensure_bucket():
    store = client()
    try:
        store.head_bucket(Bucket=bucket())
    except ClientError as exc:
        if exc.response['ResponseMetadata']['HTTPStatusCode'] != 404:
            raise
        store.create_bucket(Bucket=bucket())


def put(key, data, mime):
    ensure_bucket()
    client().put_object(Bucket=bucket(), Key=key, Body=data, ContentType=mime)


def delete_keys(keys):
    store = client()
    for key in keys:
        store.delete_object(Bucket=bucket(), Key=key)
