/**
 * Seeds the first admin user (and optional demo data).
 *   ADMIN_EMAIL / ADMIN_PASSWORD env vars set the admin login.
 *   SEED_DEMO=true adds the sample buildings and units used in the prototype.
 */
import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import ds from './data-source';
import { Building, BuildingType, Role, Unit, User } from './entities';

async function main() {
  await ds.initialize();
  const email = (process.env.ADMIN_EMAIL || 'admin@example.om').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe!2026';
  const users = ds.getRepository(User);
  if (!(await users.exists({ where: { email } }))) {
    await users.save(users.create({ email, name: 'System Administrator', role: Role.ADMIN, passwordHash: await bcrypt.hash(password, 10) }));
    console.log(`Admin user created: ${email}`);
  } else console.log(`Admin user already exists: ${email}`);

  if (process.env.SEED_DEMO === 'true' && (await ds.getRepository(Building).count()) === 0) {
    const B: [string, string, BuildingType, string, string, string, string, string][] = [
      ['B1', 'Al Khuwair Residency', BuildingType.RESIDENTIAL, 'Al Khuwair, Muscat', 'Way 3011, Bldg 1245', '23.596100', '58.428000', 'Muscat Municipality'],
      ['B2', 'Al Saada Towers', BuildingType.RESIDENTIAL, 'Al Saada, Salalah', 'Way 2217, Bldg 88', '17.045000', '54.152000', 'Dhofar Municipality'],
      ['B3', 'Ruwi Business Centre', BuildingType.COMMERCIAL, 'Ruwi, Muscat', 'Way 2905, Bldg 310', '23.588000', '58.545000', 'Muscat Municipality'],
      ['B4', 'Raysut Logistics Park', BuildingType.WAREHOUSE, 'Raysut, Salalah', 'Plot 14, Raysut Industrial Area', '16.956000', '54.005000', 'Dhofar Municipality'],
    ];
    const U: [string, string, string, number, boolean][] = [
      ['B1', '101', 'Flat 1BHK', 220, false], ['B1', '102', 'Flat 1BHK', 230, false], ['B1', '103', 'Flat 2BHK', 320, false], ['B1', '104', 'Flat 2BHK', 330, false],
      ['B1', '201', 'Flat 1BHK', 235, false], ['B1', '202', 'Flat 2BHK', 340, false], ['B1', '203', 'Flat 2BHK', 350, false], ['B1', '204', 'Flat 3BHK', 420, false],
      ['B2', 'A1', 'Flat 1BHK', 180, false], ['B2', 'A2', 'Flat 1BHK', 185, false], ['B2', 'A3', 'Flat 2BHK', 250, false], ['B2', 'A4', 'Flat 2BHK', 260, false], ['B2', 'A5', 'Flat 2BHK', 255, false], ['B2', 'A6', 'Flat 3BHK', 300, false],
      ['B3', 'S-01', 'Retail Shop', 650, true], ['B3', 'S-02', 'Retail Shop', 600, true], ['B3', 'S-03', 'Showroom', 900, true], ['B3', 'O-301', 'Office', 450, true], ['B3', 'O-302', 'Office', 470, true], ['B3', 'O-303', 'Office', 480, true],
      ['B4', 'W-1', 'Warehouse', 1500, true], ['B4', 'W-2', 'Warehouse', 1650, true], ['B4', 'W-3', 'Warehouse', 1900, true],
    ];
    const ids: Record<string, string> = {};
    for (const [code, name, type, location, addressCode, lat, lng, municipality] of B)
      ids[code] = (await ds.getRepository(Building).save({ code, name, type, location, addressCode, lat, lng, municipality })).id;
    for (const [b, unitNo, unitType, rent, vat] of U)
      await ds.getRepository(Unit).save({ buildingId: ids[b], unitNo, unitType, listedRent: rent.toFixed(3), vatApplicable: vat });
    await ds.query(`INSERT INTO counters(key, value) VALUES ('building', 4) ON CONFLICT (key) DO UPDATE SET value = GREATEST(counters.value, 4)`);
    console.log('Demo buildings and units added');
  }
  await ds.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
