-- Create table for permanent IP existence records
CREATE TABLE public.ip_inventory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'unknown',
  hostname TEXT,
  custom_hostname TEXT,
  last_seen_at TIMESTAMP WITH TIME ZONE,
  hostname_updated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ip_inventory ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Allow public read ip_inventory" 
ON public.ip_inventory 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert ip_inventory" 
ON public.ip_inventory 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update ip_inventory" 
ON public.ip_inventory 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public delete ip_inventory" 
ON public.ip_inventory 
FOR DELETE 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_ip_inventory_updated_at
BEFORE UPDATE ON public.ip_inventory
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();