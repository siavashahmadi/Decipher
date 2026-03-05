import os
from dotenv import load_dotenv

load_dotenv(override=True)

class Config:
    SUPABASE_URL = os.getenv('SUPABASE_URL')
    SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY')