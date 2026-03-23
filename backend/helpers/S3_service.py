import boto3
import logging
from flask import current_app as app

class S3Service:
    def __init__(self, bucket_name=None):
        self.bucket_name = bucket_name
        self.s3_client = boto3.client(
            's3',
            aws_access_key_id=app.config.get('AWS_ACCESS_KEY'),
            aws_secret_access_key=app.config.get('AWS_SECRET_KEY'),
            region_name=app.config.get('AWS_REGION')
        )

    def get_object_url(self, key):
        """Generate a pre-signed URL for the given S3 object key"""
        try:
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': key},
                ExpiresIn=3600  # URL valid for 1 hour
            )
            return url
        except Exception as e:
            logging.error(f"Error generating pre-signed URL for {key}: {e}")
            return None
        
    def upload_file(self, byte_stream, key, content_type=None):
        """Upload a file stream to S3 with the given key"""
        try:
            self.s3_client.upload_fileobj(byte_stream, self.bucket_name, key, ExtraArgs={'ContentType': content_type} if content_type else {})
            return True
        except Exception as e:
            logging.error(f"Error uploading file to S3 with key {key}: {e}")
            return False
    
    def delete_file(self, key):
        """Delete a file from S3 with the given key"""
        try:
            self.s3_client.delete_object(Bucket=self.bucket_name, Key=key)
            return True
        except Exception as e:
            logging.error(f"Error deleting file from S3 with key {key}: {e}")
            return False
        
    def delete_turf_folder(self, turf_id):
        """Delete all files in the turf folder"""
        prefix = f"turf_images/turf_{turf_id}/"
        try:
            # List all objects with the given prefix
            response = self.s3_client.list_objects_v2(Bucket=self.bucket_name, Prefix=prefix)
            if 'Contents' in response:
                # Delete each object
                for obj in response['Contents']:
                    self.delete_file(obj['Key'])
            return True
        except Exception as e:
            logging.error(f"Error deleting turf folder from S3 for turf_id {turf_id}: {e}")
            return False