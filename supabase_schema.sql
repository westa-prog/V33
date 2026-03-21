-- Create Profiles matching Auth Users
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  sector TEXT,
  role TEXT DEFAULT 'user',
  landing_page TEXT,
  has_imported_from_sheets BOOLEAN DEFAULT false,
  imported_at TIMESTAMP WITH TIME ZONE,
  admin_id UUID REFERENCES auth.users(id),
  assigned_boards TEXT[],
  assigned_companies TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Drivers table
CREATE TABLE public.drivers (
  id TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  board TEXT,
  devicetype TEXT,
  appversion TEXT,
  eldstatus TEXT,
  dutystatus TEXT,
  followup TEXT,
  emailsent BOOLEAN DEFAULT false,
  haspendingalert BOOLEAN DEFAULT false,
  sheetrowindex INTEGER,
  lastemailtime TIMESTAMP WITH TIME ZONE,
  lastsentat TIMESTAMP WITH TIME ZONE,
  lastpfupdate TEXT,
  lastprofilereminderat TIMESTAMP WITH TIME ZONE,
  last3dayemail TIMESTAMP WITH TIME ZONE,
  last5dayemail TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (id, user_id)
);

-- Drivers RLS
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage own drivers" ON public.drivers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Employees can view assigned drivers" ON public.drivers FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.admin_id = drivers.user_id
    AND (
      (p.assigned_boards IS NOT NULL AND drivers.board = ANY(p.assigned_boards))
      OR (p.assigned_companies IS NOT NULL AND drivers.company = ANY(p.assigned_companies))
      OR (p.assigned_boards IS NULL AND p.assigned_companies IS NULL)
    )
  )
);

-- Email Logs table
CREATE TABLE public.email_logs (
  id TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id TEXT,
  driver_name TEXT,
  timestamp TIMESTAMP WITH TIME ZONE,
  status_at_time TEXT,
  content TEXT,
  sent_via TEXT,
  type TEXT DEFAULT 'alert',
  PRIMARY KEY (id, user_id)
);

-- Email Logs RLS
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own email logs" ON public.email_logs FOR ALL USING (auth.uid() = user_id);

-- Driver Replies table
CREATE TABLE public.driver_replies (
  id TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id TEXT,
  driver_name TEXT,
  message TEXT,
  timestamp TIMESTAMP WITH TIME ZONE,
  is_read BOOLEAN DEFAULT false,
  PRIMARY KEY (id, user_id)
);

-- Driver Replies RLS
ALTER TABLE public.driver_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own driver replies" ON public.driver_replies FOR ALL USING (auth.uid() = user_id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
