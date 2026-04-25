import os
from dotenv import load_dotenv

load_dotenv(override=True)

class Config:
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY')
    SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    SHARE_SECRET = os.getenv('SHARE_SECRET')