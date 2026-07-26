-- Remove Townsville from all pricing and campaign tables — city is no longer serviced.

delete from ppl_pricing   where area = 'Townsville';
delete from ppl_campaigns where area = 'Townsville' or area = 'townsville';
