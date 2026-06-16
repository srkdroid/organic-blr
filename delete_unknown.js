const { query } = require('./scraper/db/client.js');

async function run() {
  const toDelete = [
    'Cherry (from Kashmir, 200gm box)',
    'Apricot (from Kashmir, 250gms)',
    'Apricots Fresh -Ladaki- Fruits 500 gm -Approx.',
    'Nectarin (from Himachal, 200gms)',
    'Peaches (From Kashmir, 500gm Box)',
    'Lychee (Litchi) from Muzaffarpur (Natural, ha...',
    'Raspberry - 125 gm - 1Box',
    'Mulberry | Per Box',
    'Jamun Fruit | 250 gm',
    'Organic Jamun /Nerale Hannu (Black Plum)',
    'Golden Berry 1 Box',
    'Fresh Diana Yellow Variety Figsm - 400...',
    'Fresh Turkey Brown Variety Figsm - 400...',
    'Agathi Leaves (Agase Soppu)',
    'Organic Agathi Keerai Flower (Sesbania)',
    'Organic Agathi Keerai Flower Red(Sesbania)',
    'Ajwain Leaves (Dodda Pathra)',
    'Doddapatra (Ajwain, 50gms, Packed in plastic ...',
    'Chakotha (Sakothina, Parrupu/ Bathua)',
    'Curly Kale Greenms each bunch)',
    'Mustard Greens (Rai saag)m) ~ will hav...',
    'Purslane (Gonni Soppu/ Kulfa)',
    'Purslane - Organic - 200 gms',
    '*Wheatgrassms, Harvested, Satva)',
    'Microgreens - Living Wheatgrass - Organic - 1 Box (100 gm)',
    'Micro Greens - Pink Raddishms, Harvest...',
    'Micro Greens - White Raddishms, Harvest...',
    'Micro Greens - Sunflower Shootsms, Harv...',
    'Micro Greens - Mustardms, Harvested)',
    'Micro Greens - SPICY MIX (Harvested, 50gms)',
    'Microgreens - Premium Mix - Organic - 1 Box (75 gms)',
    'Microgreens Salad - Organic - 1 Box (200 gm)',
    '*Premium Microgreens Mix - 1 Boxm) (S...',
    'Ready to Use - Sprouts - Mixedms Box)',
    'Ready to Use - Sprouts - Brown/Black Channa (...',
    'Ready to Use - Sprouts - Green Moongm...',
    'Organic Sprouts - Mixed Varieties - 130 gms'
  ];
  let deleted = 0;
  for (const name of toDelete) {
    const escapedName = name.replace(/'/g, "''");
    const sql = `DELETE FROM master_items WHERE canonical_name = '${escapedName}' AND category = 'Unknown'`;
    try {
      const res = await query(sql);
      deleted += res.rowCount;
    } catch (e) {
      console.error(e);
    }
  }
  console.log('Deleted', deleted, 'old unknown master items');
  process.exit(0);
}
run();
