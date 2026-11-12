-- NIP-REV01 · TEST DATA: sample Paracetamol Drops stock in every test barangay (one with
-- children or existing stock) so Pentavalent approvals can deduct the companion medicine.
-- Backup: backup.nip_rev01_inventory_before_paracetamol, backup.nip_rev01_inventory_batch_before_paracetamol.
-- Recorded as received by a PHN of the barangay's RHU (any PHN when the RHU has none).
with para as (
  select item_id from public.item where item_name = 'Paracetamol Drops'
), targets as (
  select b.barangay_id,
    coalesce((select p.user_id from public.public_health_nurse p where p.rhu_id = b.rhu_id order by p.user_id limit 1),
             (select p.user_id from public.public_health_nurse p order by p.user_id limit 1)) as actor
  from public.barangay b
  where (exists (select 1 from public.child c where c.barangay_id = b.barangay_id)
      or exists (select 1 from public.inventory i where i.barangay_id = b.barangay_id))
    and not exists (select 1 from public.inventory i, para where i.barangay_id = b.barangay_id and i.item_id = para.item_id)
), inv as (
  insert into public.inventory (item_id, barangay_id, quantity_on_hand, updated_at)
  select para.item_id, t.barangay_id, 50, now() from targets t, para
  returning inventory_id, barangay_id
), batch as (
  insert into public.inventory_batch (inventory_id, batch_number, expiry_date, received_date, quantity_on_hand, created_by)
  select inv.inventory_id, 'PARA-TEST-2026', (current_date + interval '18 months')::date, current_date, 50, t.actor
  from inv join targets t using (barangay_id)
  returning batch_id, inventory_id, created_by
)
insert into public.inventory_transaction (inventory_id, inventory_batch_id, transaction_type, quantity, transaction_date, reference_number, remarks, performed_by)
select batch.inventory_id, batch.batch_id, 'STOCK_IN', 50, now(), 'nip_rev01_test_stock', 'Test data: sample Paracetamol Drops stock', batch.created_by
from batch;
