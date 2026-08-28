import { db } from '../db';
import { Item, ItemLocationMapping } from '../types';
import { createServerItem, saveServerItemLocation } from '../services/api';

const SAMPLE_100_ITEMS = [
  // Medical & Healthcare
  { name: 'Panadol Extra 500mg (10s)', sku: 'SKU-MED-001', barcode: '890100100001', hsn: '3004', unit: 'BOX', pur: 18.0, sale: 30.0, mrp: 35.0, stock: 120, alert: 20 },
  { name: 'Panadol CF Cold & Flu (10s)', sku: 'SKU-MED-002', barcode: '890100100002', hsn: '3004', unit: 'BOX', pur: 25.0, sale: 45.0, mrp: 50.0, stock: 85, alert: 15 },
  { name: 'Disprin Soluble 300mg (100s)', sku: 'SKU-MED-003', barcode: '890100100003', hsn: '3004', unit: 'BOX', pur: 110.0, sale: 180.0, mrp: 200.0, stock: 40, alert: 10 },
  { name: 'Brufen 400mg Tablets (30s)', sku: 'SKU-MED-004', barcode: '890100100004', hsn: '3004', unit: 'BOX', pur: 85.0, sale: 135.0, mrp: 150.0, stock: 65, alert: 15 },
  { name: 'Flyflag 400mg Tablets (20s)', sku: 'SKU-MED-005', barcode: '890100100005', hsn: '3004', unit: 'BOX', pur: 90.0, sale: 140.0, mrp: 160.0, stock: 50, alert: 10 },
  { name: 'Gaviscon Aniseed Liquid 120ml', sku: 'SKU-MED-006', barcode: '890100100006', hsn: '3004', unit: 'PCS', pur: 210.0, sale: 290.0, mrp: 320.0, stock: 30, alert: 8 },
  { name: 'Rigix 10mg Tablets (10s)', sku: 'SKU-MED-007', barcode: '890100100007', hsn: '3004', unit: 'BOX', pur: 60.0, sale: 95.0, mrp: 110.0, stock: 75, alert: 15 },
  { name: 'Surbex Z Multivitamins (30s)', sku: 'SKU-MED-008', barcode: '890100100008', hsn: '3004', unit: 'BOX', pur: 280.0, sale: 390.0, mrp: 420.0, stock: 45, alert: 10 },
  { name: 'CAC 1000 Plus Effervescent (10s)', sku: 'SKU-MED-009', barcode: '890100100009', hsn: '3004', unit: 'PACK', pur: 190.0, sale: 260.0, mrp: 285.0, stock: 55, alert: 12 },
  { name: 'Dettol Antiseptic Liquid 250ml', sku: 'SKU-MED-010', barcode: '890100100010', hsn: '3808', unit: 'PCS', pur: 240.0, sale: 320.0, mrp: 350.0, stock: 90, alert: 20 },

  // Dairy & Bakery
  { name: "Olper's Full Cream Milk 1L", sku: 'SKU-DRY-001', barcode: '890200200001', hsn: '0401', unit: 'PACK', pur: 250.0, sale: 290.0, mrp: 295.0, stock: 200, alert: 30 },
  { name: 'MilkPak Full Cream Milk 1L', sku: 'SKU-DRY-002', barcode: '890200200002', hsn: '0401', unit: 'PACK', pur: 252.0, sale: 290.0, mrp: 295.0, stock: 180, alert: 30 },
  { name: 'Tarang Milk Whitener 225ml', sku: 'SKU-DRY-003', barcode: '890200200003', hsn: '0402', unit: 'PACK', pur: 55.0, sale: 70.0, mrp: 75.0, stock: 300, alert: 50 },
  { name: 'EveryDay Tea Whitener 200g', sku: 'SKU-DRY-004', barcode: '890200200004', hsn: '0402', unit: 'PACK', pur: 240.0, sale: 295.0, mrp: 310.0, stock: 110, alert: 20 },
  { name: 'Nestle MilkPak Cream 200ml', sku: 'SKU-DRY-005', barcode: '890200200005', hsn: '0401', unit: 'PACK', pur: 140.0, sale: 175.0, mrp: 185.0, stock: 85, alert: 15 },
  { name: "Adams Cheddar Cheese 200g", sku: 'SKU-DRY-006', barcode: '890200200006', hsn: '0406', unit: 'PACK', pur: 420.0, sale: 520.0, mrp: 550.0, stock: 35, alert: 8 },
  { name: 'Blue Band Butter Spread 200g', sku: 'SKU-DRY-007', barcode: '890200200007', hsn: '0405', unit: 'PACK', pur: 195.0, sale: 250.0, mrp: 270.0, stock: 60, alert: 10 },
  { name: 'Dawn Bread Plain Large', sku: 'SKU-DRY-008', barcode: '890200200008', hsn: '1905', unit: 'PACK', pur: 120.0, sale: 150.0, mrp: 160.0, stock: 40, alert: 10 },
  { name: 'Wonder Bread Sandwich Family', sku: 'SKU-DRY-009', barcode: '890200200009', hsn: '1905', unit: 'PACK', pur: 140.0, sale: 175.0, mrp: 180.0, stock: 30, alert: 8 },
  { name: 'Dawn Milky Rusk 200g', sku: 'SKU-DRY-010', barcode: '890200200010', hsn: '1905', unit: 'PACK', pur: 90.0, sale: 120.0, mrp: 130.0, stock: 70, alert: 15 },

  // Beverages & Cold Drinks
  { name: 'Pepsi Cola 1.5L Bottle', sku: 'SKU-BEV-001', barcode: '890300300001', hsn: '2202', unit: 'PCS', pur: 145.0, sale: 180.0, mrp: 190.0, stock: 150, alert: 25 },
  { name: 'Coca-Cola 1.5L Bottle', sku: 'SKU-BEV-002', barcode: '890300300002', hsn: '2202', unit: 'PCS', pur: 145.0, sale: 180.0, mrp: 190.0, stock: 160, alert: 25 },
  { name: 'Sprite 1.5L Bottle', sku: 'SKU-BEV-003', barcode: '890300300003', hsn: '2202', unit: 'PCS', pur: 145.0, sale: 180.0, mrp: 190.0, stock: 140, alert: 20 },
  { name: '7Up 1.5L Bottle', sku: 'SKU-BEV-004', barcode: '890300300004', hsn: '2202', unit: 'PCS', pur: 145.0, sale: 180.0, mrp: 190.0, stock: 130, alert: 20 },
  { name: 'Red Bull Energy Drink 250ml', sku: 'SKU-BEV-005', barcode: '890300300005', hsn: '2202', unit: 'PCS', pur: 380.0, sale: 480.0, mrp: 500.0, stock: 45, alert: 10 },
  { name: 'Nestle Pure Life Water 1.5L', sku: 'SKU-BEV-006', barcode: '890300300006', hsn: '2201', unit: 'PCS', pur: 65.0, sale: 90.0, mrp: 100.0, stock: 250, alert: 40 },
  { name: 'Shezan Mango Juice 250ml', sku: 'SKU-BEV-007', barcode: '890300300007', hsn: '2009', unit: 'PACK', pur: 35.0, sale: 50.0, mrp: 55.0, stock: 120, alert: 20 },
  { name: 'Nestle Fruita Vitals Mango 1L', sku: 'SKU-BEV-008', barcode: '890300300008', hsn: '2009', unit: 'PACK', pur: 240.0, sale: 295.0, mrp: 310.0, stock: 70, alert: 15 },
  { name: 'Rooh Afza Syrup 800ml Bottle', sku: 'SKU-BEV-009', barcode: '890300300009', hsn: '2106', unit: 'PCS', pur: 310.0, sale: 390.0, mrp: 420.0, stock: 65, alert: 12 },
  { name: 'Tang Orange Drink Powder 500g', sku: 'SKU-BEV-010', barcode: '890300300010', hsn: '2106', unit: 'PACK', pur: 450.0, sale: 560.0, mrp: 590.0, stock: 50, alert: 10 },

  // Tea, Coffee & Staples
  { name: 'Tapal Danedar Tea 950g Pouch', sku: 'SKU-STP-001', barcode: '890400400001', hsn: '0902', unit: 'PACK', pur: 1320.0, sale: 1580.0, mrp: 1650.0, stock: 60, alert: 10 },
  { name: 'Lipton Yellow Label Tea 450g', sku: 'SKU-STP-002', barcode: '890400400002', hsn: '0902', unit: 'PACK', pur: 720.0, sale: 890.0, mrp: 930.0, stock: 75, alert: 12 },
  { name: 'Nescafe Classic Instant Coffee 100g', sku: 'SKU-STP-003', barcode: '890400400003', hsn: '0901', unit: 'PCS', pur: 850.0, sale: 1050.0, mrp: 1100.0, stock: 35, alert: 8 },
  { name: 'Guard Supreme Basmati Rice 5kg', sku: 'SKU-STP-004', barcode: '890400400004', hsn: '1006', unit: 'PACK', pur: 1650.0, sale: 1980.0, mrp: 2100.0, stock: 40, alert: 8 },
  { name: 'Habib Cooking Oil 5L Can', sku: 'SKU-STP-005', barcode: '890400400005', hsn: '1512', unit: 'PCS', pur: 2450.0, sale: 2850.0, mrp: 2950.0, stock: 30, alert: 6 },
  { name: 'Mezan Canola Oil 1L Pouch', sku: 'SKU-STP-006', barcode: '890400400006', hsn: '1514', unit: 'PACK', pur: 490.0, sale: 560.0, mrp: 590.0, stock: 90, alert: 15 },
  { name: 'Dalda Banaspati Ghee 1kg', sku: 'SKU-STP-007', barcode: '890400400007', hsn: '1516', unit: 'PACK', pur: 510.0, sale: 580.0, mrp: 610.0, stock: 80, alert: 15 },
  { name: 'National Iodized Salt 800g', sku: 'SKU-STP-008', barcode: '890400400008', hsn: '2501', unit: 'PACK', pur: 45.0, sale: 60.0, mrp: 65.0, stock: 180, alert: 30 },
  { name: 'Refined Fine White Sugar 1kg', sku: 'SKU-STP-009', barcode: '890400400009', hsn: '1701', unit: 'KG', pur: 135.0, sale: 150.0, mrp: 160.0, stock: 350, alert: 50 },
  { name: 'Sunridge Whole Wheat Atta 10kg', sku: 'SKU-STP-010', barcode: '890400400010', hsn: '1101', unit: 'PACK', pur: 1280.0, sale: 1450.0, mrp: 1520.0, stock: 50, alert: 10 },

  // Spices & Cooking Ingredients
  { name: 'Shan Bombay Biryani Masala 50g', sku: 'SKU-SPC-001', barcode: '890500500001', hsn: '0910', unit: 'PACK', pur: 95.0, sale: 120.0, mrp: 130.0, stock: 140, alert: 20 },
  { name: 'Shan Nihari Masala 50g', sku: 'SKU-SPC-002', barcode: '890500500002', hsn: '0910', unit: 'PACK', pur: 95.0, sale: 120.0, mrp: 130.0, stock: 95, alert: 15 },
  { name: 'National Red Chili Powder 200g', sku: 'SKU-SPC-003', barcode: '890500500003', hsn: '0904', unit: 'PACK', pur: 210.0, sale: 270.0, mrp: 290.0, stock: 85, alert: 15 },
  { name: 'National Turmeric Powder 200g', sku: 'SKU-SPC-004', barcode: '890500500004', hsn: '0910', unit: 'PACK', pur: 180.0, sale: 230.0, mrp: 250.0, stock: 70, alert: 12 },
  { name: 'National Coriander Powder 200g', sku: 'SKU-SPC-005', barcode: '890500500005', hsn: '0909', unit: 'PACK', pur: 175.0, sale: 220.0, mrp: 240.0, stock: 65, alert: 12 },
  { name: 'Mitchells Tomato Ketchup 500g', sku: 'SKU-SPC-006', barcode: '890500500006', hsn: '2103', unit: 'PCS', pur: 220.0, sale: 285.0, mrp: 300.0, stock: 90, alert: 15 },
  { name: 'Youngs Mayonnaise Pouch 500g', sku: 'SKU-SPC-007', barcode: '890500500007', hsn: '2103', unit: 'PACK', pur: 310.0, sale: 390.0, mrp: 410.0, stock: 75, alert: 12 },
  { name: 'Dipitt Chili Garlic Sauce 300g', sku: 'SKU-SPC-008', barcode: '890500500008', hsn: '2103', unit: 'PCS', pur: 190.0, sale: 245.0, mrp: 260.0, stock: 60, alert: 10 },
  { name: 'National Mango Pickle 1kg Jar', sku: 'SKU-SPC-009', barcode: '890500500009', hsn: '2001', unit: 'PCS', pur: 340.0, sale: 430.0, mrp: 460.0, stock: 40, alert: 8 },
  { name: 'Mitchells Mixed Fruit Jam 450g', sku: 'SKU-SPC-010', barcode: '890500500010', hsn: '2007', unit: 'PCS', pur: 260.0, sale: 330.0, mrp: 350.0, stock: 50, alert: 10 },

  // Snacks, Biscuits & Chocolates
  { name: 'Lays Masala Chips 50g', sku: 'SKU-SNK-001', barcode: '890600600001', hsn: '1905', unit: 'PACK', pur: 42.0, sale: 50.0, mrp: 50.0, stock: 240, alert: 40 },
  { name: 'Lays French Cheese Chips 50g', sku: 'SKU-SNK-002', barcode: '890600600002', hsn: '1905', unit: 'PACK', pur: 42.0, sale: 50.0, mrp: 50.0, stock: 220, alert: 40 },
  { name: 'Kurkure Chutney Chaska 50g', sku: 'SKU-SNK-003', barcode: '890600600003', hsn: '1905', unit: 'PACK', pur: 42.0, sale: 50.0, mrp: 50.0, stock: 180, alert: 30 },
  { name: 'Oreo Original Cookies 120g', sku: 'SKU-SNK-004', barcode: '890600600004', hsn: '1905', unit: 'PACK', pur: 75.0, sale: 100.0, mrp: 110.0, stock: 130, alert: 20 },
  { name: 'LU Prince Chocolate Biscuits 120g', sku: 'SKU-SNK-005', barcode: '890600600005', hsn: '1905', unit: 'PACK', pur: 55.0, sale: 75.0, mrp: 80.0, stock: 160, alert: 25 },
  { name: 'LU Candi Biscuit 120g', sku: 'SKU-SNK-006', barcode: '890600600006', hsn: '1905', unit: 'PACK', pur: 55.0, sale: 75.0, mrp: 80.0, stock: 140, alert: 20 },
  { name: 'Peek Freans Super Biscuits 100g', sku: 'SKU-SNK-007', barcode: '890600600007', hsn: '1905', unit: 'PACK', pur: 45.0, sale: 60.0, mrp: 65.0, stock: 190, alert: 30 },
  { name: 'Cadbury Dairy Milk 90g', sku: 'SKU-SNK-008', barcode: '890600600008', hsn: '1806', unit: 'PCS', pur: 210.0, sale: 270.0, mrp: 290.0, stock: 85, alert: 15 },
  { name: 'KitKat 4 Finger Chocolate 45g', sku: 'SKU-SNK-009', barcode: '890600600009', hsn: '1806', unit: 'PCS', pur: 170.0, sale: 220.0, mrp: 240.0, stock: 95, alert: 15 },
  { name: 'Snickers Chocolate Bar 50g', sku: 'SKU-SNK-010', barcode: '890600600010', hsn: '1806', unit: 'PCS', pur: 170.0, sale: 220.0, mrp: 240.0, stock: 90, alert: 15 },

  // Personal Care & Hygiene
  { name: 'Colgate MaxFresh Toothpaste 150g', sku: 'SKU-PER-001', barcode: '890700700001', hsn: '3306', unit: 'PCS', pur: 190.0, sale: 245.0, mrp: 260.0, stock: 110, alert: 20 },
  { name: 'Sensodyne Rapid Action 100g', sku: 'SKU-PER-002', barcode: '890700700002', hsn: '3306', unit: 'PCS', pur: 320.0, sale: 410.0, mrp: 440.0, stock: 60, alert: 10 },
  { name: 'Sunsilk Black Shine Shampoo 360ml', sku: 'SKU-PER-003', barcode: '890700700003', hsn: '3305', unit: 'PCS', pur: 410.0, sale: 520.0, mrp: 550.0, stock: 75, alert: 12 },
  { name: 'Head & Shoulders Anti-Dandruff 360ml', sku: 'SKU-PER-004', barcode: '890700700004', hsn: '3305', unit: 'PCS', pur: 490.0, sale: 620.0, mrp: 660.0, stock: 65, alert: 10 },
  { name: 'Pantene Pro-V Smooth Shampoo 360ml', sku: 'SKU-PER-005', barcode: '890700700005', hsn: '3305', unit: 'PCS', pur: 470.0, sale: 590.0, mrp: 630.0, stock: 55, alert: 10 },
  { name: 'Lux Velvet Touch Beauty Soap 150g', sku: 'SKU-PER-006', barcode: '890700700006', hsn: '3401', unit: 'PCS', pur: 115.0, sale: 145.0, mrp: 155.0, stock: 140, alert: 25 },
  { name: 'Dettol Original Soap 100g', sku: 'SKU-PER-007', barcode: '890700700007', hsn: '3401', unit: 'PCS', pur: 95.0, sale: 125.0, mrp: 135.0, stock: 160, alert: 25 },
  { name: 'Lifebuoy Total 10 Soap 115g', sku: 'SKU-PER-008', barcode: '890700700008', hsn: '3401', unit: 'PCS', pur: 85.0, sale: 110.0, mrp: 120.0, stock: 180, alert: 30 },
  { name: 'Gillette Mach3 Razor Cartridge', sku: 'SKU-PER-009', barcode: '890700700009', hsn: '8212', unit: 'PACK', pur: 550.0, sale: 690.0, mrp: 730.0, stock: 40, alert: 8 },
  { name: 'Nivea Soft Cream Moist 100ml', sku: 'SKU-PER-010', barcode: '890700700010', hsn: '3304', unit: 'PCS', pur: 340.0, sale: 440.0, mrp: 470.0, stock: 50, alert: 10 },

  // Household & Cleaning Supplies
  { name: 'Surf Excel Washing Powder 1kg', sku: 'SKU-HSD-001', barcode: '890800800001', hsn: '3402', unit: 'PACK', pur: 490.0, sale: 590.0, mrp: 620.0, stock: 110, alert: 20 },
  { name: 'Ariel Complete Laundry Powder 1kg', sku: 'SKU-HSD-002', barcode: '890800800002', hsn: '3402', unit: 'PACK', pur: 480.0, sale: 580.0, mrp: 610.0, stock: 100, alert: 20 },
  { name: 'Bonus Tristar Washing Powder 1kg', sku: 'SKU-HSD-003', barcode: '890800800003', hsn: '3402', unit: 'PACK', pur: 280.0, sale: 350.0, mrp: 370.0, stock: 130, alert: 25 },
  { name: 'Max Liquid Dishwash Gel 500ml', sku: 'SKU-HSD-004', barcode: '890800800004', hsn: '3402', unit: 'PCS', pur: 190.0, sale: 245.0, mrp: 260.0, stock: 85, alert: 15 },
  { name: 'Vim Dishwash Bar 300g', sku: 'SKU-HSD-005', barcode: '890800800005', hsn: '3401', unit: 'PCS', pur: 75.0, sale: 95.0, mrp: 105.0, stock: 150, alert: 25 },
  { name: 'Harpic Toilet Cleaner Power Plus 500ml', sku: 'SKU-HSD-006', barcode: '890800800006', hsn: '3402', unit: 'PCS', pur: 230.0, sale: 295.0, mrp: 315.0, stock: 95, alert: 15 },
  { name: 'Colin Glass Cleaner Spray 500ml', sku: 'SKU-HSD-007', barcode: '890800800007', hsn: '3402', unit: 'PCS', pur: 210.0, sale: 270.0, mrp: 290.0, stock: 65, alert: 10 },
  { name: 'Scotch-Brite Scrub Sponge 3-Pack', sku: 'SKU-HSD-008', barcode: '890800800008', hsn: '6805', unit: 'PACK', pur: 140.0, sale: 185.0, mrp: 200.0, stock: 120, alert: 20 },
  { name: 'Rose Petal Tissue Box 200s', sku: 'SKU-HSD-009', barcode: '890800800009', hsn: '4818', unit: 'BOX', pur: 160.0, sale: 210.0, mrp: 225.0, stock: 90, alert: 15 },
  { name: 'Rose Petal Kitchen Towel Twin Roll', sku: 'SKU-HSD-010', barcode: '890800800010', hsn: '4818', unit: 'PACK', pur: 190.0, sale: 245.0, mrp: 260.0, stock: 70, alert: 12 },

  // Electronics & Office Stationary
  { name: 'Energizer AA Alkaline Batteries 4-Pack', sku: 'SKU-ELE-001', barcode: '890900900001', hsn: '8506', unit: 'PACK', pur: 320.0, sale: 420.0, mrp: 450.0, stock: 65, alert: 10 },
  { name: 'Duracell AAA Ultra Batteries 4-Pack', sku: 'SKU-ELE-002', barcode: '890900900002', hsn: '8506', unit: 'PACK', pur: 390.0, sale: 495.0, mrp: 530.0, stock: 55, alert: 10 },
  { name: 'Philips Energy Saver LED Bulb 12W', sku: 'SKU-ELE-003', barcode: '890900900003', hsn: '8539', unit: 'PCS', pur: 280.0, sale: 360.0, mrp: 390.0, stock: 80, alert: 15 },
  { name: 'Anker USB-C Braided Cable 1M', sku: 'SKU-ELE-004', barcode: '890900900004', hsn: '8544', unit: 'PCS', pur: 750.0, sale: 990.0, mrp: 1100.0, stock: 30, alert: 5 },
  { name: 'Double A A4 Paper 80gsm 500 Sheets', sku: 'SKU-OFF-001', barcode: '890900900005', hsn: '4802', unit: 'PACK', pur: 1250.0, sale: 1480.0, mrp: 1550.0, stock: 45, alert: 8 },
  { name: 'Dollar Board Marker Black (12s)', sku: 'SKU-OFF-002', barcode: '890900900006', hsn: '9608', unit: 'BOX', pur: 340.0, sale: 440.0, mrp: 480.0, stock: 50, alert: 10 },
  { name: 'Pilot G2 Gel Pen Black 0.7mm', sku: 'SKU-OFF-003', barcode: '890900900007', hsn: '9608', unit: 'PCS', pur: 160.0, sale: 210.0, mrp: 230.0, stock: 120, alert: 20 },
  { name: 'Thermal Receipt Paper Roll 80mm (10s)', sku: 'SKU-OFF-004', barcode: '890900900008', hsn: '4811', unit: 'PACK', pur: 450.0, sale: 580.0, mrp: 620.0, stock: 75, alert: 15 },
  { name: 'Bake Parlor Elbow Macaroni 400g', sku: 'SKU-FOD-001', barcode: '890900900009', hsn: '1902', unit: 'PACK', pur: 140.0, sale: 180.0, mrp: 195.0, stock: 110, alert: 20 },
  { name: 'Kolson Spaghetti No. 4 400g', sku: 'SKU-FOD-002', barcode: '890900900010', hsn: '1902', unit: 'PACK', pur: 140.0, sale: 180.0, mrp: 195.0, stock: 100, alert: 20 },

  // Instant Foods & Noodles
  { name: 'Knorr Chicken Noodles 66g', sku: 'SKU-FOD-003', barcode: '891001000001', hsn: '1902', unit: 'PACK', pur: 42.0, sale: 55.0, mrp: 60.0, stock: 260, alert: 40 },
  { name: 'Knorr Chattpatta Noodles 66g', sku: 'SKU-FOD-004', barcode: '891001000002', hsn: '1902', unit: 'PACK', pur: 42.0, sale: 55.0, mrp: 60.0, stock: 240, alert: 40 },
  { name: 'Shoop Noodles Spicy 66g', sku: 'SKU-FOD-005', barcode: '891001000003', hsn: '1902', unit: 'PACK', pur: 38.0, sale: 50.0, mrp: 55.0, stock: 200, alert: 30 },
  { name: 'Nestle Everyday Powder 900g Pouch', sku: 'SKU-FOD-006', barcode: '891001000004', hsn: '0402', unit: 'PACK', pur: 1150.0, sale: 1380.0, mrp: 1450.0, stock: 40, alert: 8 },
  { name: 'Cerelac Wheat Apple 350g Tin', sku: 'SKU-FOD-007', barcode: '891001000005', hsn: '1901', unit: 'PCS', pur: 450.0, sale: 550.0, mrp: 580.0, stock: 35, alert: 8 },
  { name: 'Horlicks Malt Drink Chocolate 500g Jar', sku: 'SKU-FOD-008', barcode: '891001000006', hsn: '1901', unit: 'PCS', pur: 580.0, sale: 720.0, mrp: 760.0, stock: 30, alert: 6 },
  { name: 'Milo Chocolate Malt Powder 400g Tin', sku: 'SKU-FOD-009', barcode: '891001000007', hsn: '1901', unit: 'PCS', pur: 620.0, sale: 780.0, mrp: 820.0, stock: 28, alert: 5 },
  { name: 'Nutella Hazelnut Cocoa Spread 350g Jar', sku: 'SKU-FOD-010', barcode: '891001000008', hsn: '1806', unit: 'PCS', pur: 890.0, sale: 1120.0, mrp: 1180.0, stock: 32, alert: 6 },
  { name: 'Knorr Tomato Soup Powder 50g', sku: 'SKU-FOD-011', barcode: '891001000009', hsn: '2104', unit: 'PACK', pur: 65.0, sale: 85.0, mrp: 95.0, stock: 90, alert: 15 },
  { name: 'Laziza Kheer Mix Dessert 155g', sku: 'SKU-FOD-012', barcode: '891001000010', hsn: '1901', unit: 'PACK', pur: 110.0, sale: 145.0, mrp: 155.0, stock: 75, alert: 12 },

  // Additional FMCG Products to complete 100
  { name: 'Shan Tandoori Masala 50g', sku: 'SKU-SPC-011', barcode: '891101100001', hsn: '0910', unit: 'PACK', pur: 95.0, sale: 120.0, mrp: 130.0, stock: 80, alert: 15 },
  { name: 'National Synthetic Vinegar 600ml', sku: 'SKU-SPC-012', barcode: '891101100002', hsn: '2209', unit: 'PCS', pur: 85.0, sale: 115.0, mrp: 125.0, stock: 90, alert: 15 },
  { name: 'Saffola Gold Oil 1L Pouch', sku: 'SKU-STP-011', barcode: '891101100003', hsn: '1512', unit: 'PACK', pur: 520.0, sale: 610.0, mrp: 640.0, stock: 60, alert: 10 },
  { name: 'Rafhan Cornflour 300g Pack', sku: 'SKU-STP-012', barcode: '891101100004', hsn: '1108', unit: 'PACK', pur: 110.0, sale: 145.0, mrp: 155.0, stock: 85, alert: 15 },
  { name: 'Ahmad Tea English Breakfast 100 Tea Bags', sku: 'SKU-STP-013', barcode: '891101100005', hsn: '0902', unit: 'BOX', pur: 850.0, sale: 1080.0, mrp: 1150.0, stock: 25, alert: 5 },
  { name: 'Tetley Black Tea Bags 100s', sku: 'SKU-STP-014', barcode: '891101100006', hsn: '0902', unit: 'BOX', pur: 650.0, sale: 820.0, mrp: 880.0, stock: 35, alert: 8 },
  { name: 'Johnson Baby Powder 200g', sku: 'SKU-PER-011', barcode: '891101100007', hsn: '3304', unit: 'PCS', pur: 320.0, sale: 410.0, mrp: 440.0, stock: 45, alert: 8 },
  { name: 'Johnson Baby Lotion 200ml', sku: 'SKU-PER-012', barcode: '891101100008', hsn: '3304', unit: 'PCS', pur: 390.0, sale: 495.0, mrp: 530.0, stock: 40, alert: 8 },
  { name: 'Safeguard Lemon Soap 115g', sku: 'SKU-PER-013', barcode: '891101100009', hsn: '3401', unit: 'PCS', pur: 95.0, sale: 125.0, mrp: 135.0, stock: 120, alert: 20 },
  { name: 'Palmolive Body Wash Aroma 250ml', sku: 'SKU-PER-014', barcode: '891101100010', hsn: '3401', unit: 'PCS', pur: 360.0, sale: 460.0, mrp: 490.0, stock: 35, alert: 8 },
  { name: "L'Oreal Paris Total Repair Shampoo 360ml", sku: 'SKU-PER-015', barcode: '891101100011', hsn: '3305', unit: 'PCS', pur: 580.0, sale: 740.0, mrp: 790.0, stock: 30, alert: 6 },
  { name: 'Parachute Pure Coconut Hair Oil 300ml', sku: 'SKU-PER-016', barcode: '891101100012', hsn: '3305', unit: 'PCS', pur: 280.0, sale: 360.0, mrp: 385.0, stock: 65, alert: 10 },
  { name: 'Vatika Enriched Olive Hair Oil 200ml', sku: 'SKU-PER-017', barcode: '891101100013', hsn: '3305', unit: 'PCS', pur: 240.0, sale: 310.0, mrp: 335.0, stock: 55, alert: 10 },
  { name: 'Vaseline Pure Petroleum Jelly 100g', sku: 'SKU-PER-018', barcode: '891101100014', hsn: '3304', unit: 'PCS', pur: 190.0, sale: 245.0, mrp: 260.0, stock: 80, alert: 15 },
  { name: 'Fair & Lovely Face Wash Glow 100g', sku: 'SKU-PER-019', barcode: '891101100015', hsn: '3304', unit: 'PCS', pur: 210.0, sale: 270.0, mrp: 290.0, stock: 70, alert: 12 },
  { name: 'Garnier Men TurboLight Face Wash 100g', sku: 'SKU-PER-020', barcode: '891101100016', hsn: '3304', unit: 'PCS', pur: 280.0, sale: 360.0, mrp: 390.0, stock: 50, alert: 10 },
  { name: 'Pampers Fresh Baby Wipes 64s', sku: 'SKU-PER-021', barcode: '891101100017', hsn: '3401', unit: 'PACK', pur: 320.0, sale: 420.0, mrp: 450.0, stock: 60, alert: 10 },
  { name: 'Walls Feast Chocolate Ice Cream', sku: 'SKU-DRY-011', barcode: '891101100018', hsn: '2105', unit: 'PCS', pur: 65.0, sale: 80.0, mrp: 80.0, stock: 90, alert: 15 },
  { name: 'Nido Fortified Powder Milk 400g Tin', sku: 'SKU-DRY-012', barcode: '891101100019', hsn: '0402', unit: 'PCS', pur: 780.0, sale: 950.0, mrp: 990.0, stock: 40, alert: 8 },
  { name: 'Tullo Banaspati Ghee 1kg Pouch', sku: 'SKU-STP-015', barcode: '891101100020', hsn: '1516', unit: 'PACK', pur: 490.0, sale: 560.0, mrp: 590.0, stock: 85, alert: 15 }
];

/**
 * Seeds 100 sample items into local Dexie IndexedDB and cloud PostgreSQL server.
 * Also maps a portion of them into locations for location management testing.
 */
export async function seed100SampleItems(tenantId: string = 'default-tenant'): Promise<number> {
  try {
    let addedCount = 0;

    // Fetch available locations for tenant
    let locations = await db.locations.filter(l => (l.tenantId || 'default-tenant') === tenantId).toArray();
    if (locations.length === 0) {
      const mainStoreId = `wh-main-${tenantId}`;
      await db.locations.put({
        id: mainStoreId,
        tenantId,
        name: 'Main Store / Godown',
        code: 'WH-MAIN',
        type: 'WAREHOUSE',
        capacity: 5000,
        description: 'Primary retail storefront warehouse',
        createdAt: new Date().toISOString()
      });

      const aisleAId = `zone-a1-${tenantId}`;
      await db.locations.put({
        id: aisleAId,
        tenantId,
        name: 'Aisle 1 - General FMCG',
        code: 'ZONE-A1',
        type: 'ZONE',
        parentId: mainStoreId,
        capacity: 1500,
        description: 'Front store fast moving items',
        createdAt: new Date().toISOString()
      });

      const shelfAId = `shelf-a1-01-${tenantId}`;
      await db.locations.put({
        id: shelfAId,
        tenantId,
        name: 'Shelf A1-Bin 01',
        code: 'SH-A1-01',
        type: 'SHELF',
        parentId: aisleAId,
        capacity: 250,
        description: 'Top shelf for packaged goods',
        createdAt: new Date().toISOString()
      });

      locations = await db.locations.filter(l => (l.tenantId || 'default-tenant') === tenantId).toArray();
    }

    const shelfLocations = locations.filter(l => l.type === 'SHELF' || l.type === 'ZONE');

    for (let idx = 0; idx < SAMPLE_100_ITEMS.length; idx++) {
      const sample = SAMPLE_100_ITEMS[idx];
      try {
        const existing = await db.items.where('skuCode').equals(sample.sku).first();

        if (!existing) {
          const itemData: Item = {
            tenantId,
            name: sample.name,
            skuCode: sample.sku,
            barcode: sample.barcode,
            hsnSacCode: sample.hsn,
            unitType: sample.unit as any,
            purchasePrice: sample.pur,
            salesPrice: sample.sale,
            mrp: sample.mrp,
            minStockAlert: sample.alert,
            currentStock: sample.stock,
            cgstRate: 0,
            sgstRate: 0,
            igstRate: 0,
            isActive: true,
            updatedAt: new Date().toISOString()
          };

          const newItemId = await db.items.add(itemData);
          addedCount++;

          // Asynchronously send to cloud PostgreSQL server
          createServerItem(itemData).catch(() => {});

          // Assign first 60% of items to a random shelf location
          if (idx % 10 < 6 && shelfLocations.length > 0 && newItemId) {
            const assignedLoc = shelfLocations[idx % shelfLocations.length];
            if (assignedLoc && assignedLoc.id) {
              const mappingData: ItemLocationMapping = {
                tenantId,
                itemId: newItemId,
                locationId: assignedLoc.id,
                quantity: sample.stock,
                maxCapacity: sample.stock + 50,
                updatedAt: new Date().toISOString()
              };
              await db.itemLocations.add(mappingData);
              saveServerItemLocation(mappingData).catch(() => {});
            }
          }
        }
      } catch (itemErr) {
        console.warn(`[Seeder Warning] Item ${sample.name} failed:`, itemErr);
      }
    }

    return addedCount;
  } catch (err: any) {
    console.error('[Seeder Exception]', err);
    return 0;
  }
}
