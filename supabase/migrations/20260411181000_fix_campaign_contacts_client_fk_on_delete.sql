-- Ensure deleting a client does not fail because of legacy campaign_contacts references.
ALTER TABLE public.campaign_contacts
  DROP CONSTRAINT IF EXISTS campaign_contacts_client_id_fkey;

ALTER TABLE public.campaign_contacts
  ADD CONSTRAINT campaign_contacts_client_id_fkey
  FOREIGN KEY (client_id)
  REFERENCES public.clients(id)
  ON DELETE SET NULL;
