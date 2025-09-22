-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  creator_name VARCHAR(255),
  creator_email VARCHAR(255),
  embeddings JSONB NOT NULL,
  reference_photos TEXT[],
  status VARCHAR(50) DEFAULT 'active',
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days'
);

-- Create scans table
CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  friend_email VARCHAR(255),
  oauth_token_encrypted TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',
  total_photos INT DEFAULT 0,
  scanned_photos INT DEFAULT 0,
  matched_photos INT DEFAULT 0,
  uploaded_photos INT DEFAULT 0,
  error_message TEXT,
  job_id VARCHAR(255) UNIQUE
);

-- Create matched_photos table
CREATE TABLE IF NOT EXISTS matched_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_id UUID REFERENCES scans(id) ON DELETE CASCADE,
  google_photo_id VARCHAR(255) NOT NULL,
  google_photo_url TEXT,
  s3_url TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  thumbnail_url TEXT,
  detected_at TIMESTAMP DEFAULT NOW(),
  confidence_score FLOAT,
  metadata JSONB
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_creator_email ON sessions(creator_email);

CREATE INDEX IF NOT EXISTS idx_scans_session_id ON scans(session_id);
CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
CREATE INDEX IF NOT EXISTS idx_scans_job_id ON scans(job_id);
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at);

CREATE INDEX IF NOT EXISTS idx_matched_photos_scan_id ON matched_photos(scan_id);
CREATE INDEX IF NOT EXISTS idx_matched_photos_google_photo_id ON matched_photos(google_photo_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to sessions table
CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert test data (optional, for development)
-- INSERT INTO sessions (creator_name, creator_email, embeddings, reference_photos)
-- VALUES ('Test User', 'test@example.com', '[]'::jsonb, ARRAY['https://example.com/photo1.jpg']);
