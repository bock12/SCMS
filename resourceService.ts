export interface ChurchResource {
  id: string;
  name: string;
  category: 'Venue & Rooms' | 'Audio/Visual & Sound' | 'Seating & Furniture' | 'Power & Utilities' | 'Vestments & Hospitality';
  total_quantity: number;
  available_quantity: number;
  unit_rental_cost_sle: number; // Cost in SLE if rented/allocated
  location: string;
  status: 'available' | 'maintenance' | 'reserved';
}

export interface EventResourceReservation {
  id: string;
  event_id: string;
  event_title: string;
  resource_id: string;
  resource_name: string;
  category: string;
  quantity_reserved: number;
  rental_cost_sle: number; // Quantity * Unit Cost
  status: 'confirmed' | 'pending' | 'returned';
  reserved_at: string;
  notes?: string;
}

const RESOURCES_STORAGE_KEY = 'faithconnect_church_resources_v1';
const RESERVATIONS_STORAGE_KEY = 'faithconnect_event_resource_reservations_v1';

export const INITIAL_RESOURCES: ChurchResource[] = [
  { id: 'res-1', name: 'Main Sanctuary Auditorium', category: 'Venue & Rooms', total_quantity: 1, available_quantity: 1, unit_rental_cost_sle: 500, location: 'Central Complex Floor 1', status: 'available' },
  { id: 'res-2', name: 'Fellowship & Dining Hall', category: 'Venue & Rooms', total_quantity: 1, available_quantity: 1, unit_rental_cost_sle: 300, location: 'Annex Building', status: 'available' },
  { id: 'res-3', name: 'Padded Banquet Chairs (Set of 50)', category: 'Seating & Furniture', total_quantity: 10, available_quantity: 8, unit_rental_cost_sle: 150, location: 'Logistics Warehouse', status: 'available' },
  { id: 'res-4', name: 'Shure Wireless Vocal Mic Console (4x Units)', category: 'Audio/Visual & Sound', total_quantity: 3, available_quantity: 2, unit_rental_cost_sle: 250, location: 'Media Studio', status: 'available' },
  { id: 'res-5', name: 'Optoma 4K HD Laser Projector & Screen', category: 'Audio/Visual & Sound', total_quantity: 2, available_quantity: 2, unit_rental_cost_sle: 200, location: 'Media Control Booth', status: 'available' },
  { id: 'res-6', name: '50kVA Heavy-Duty Standby Generator & Fuel Logistics', category: 'Power & Utilities', total_quantity: 1, available_quantity: 1, unit_rental_cost_sle: 400, location: 'Power Plant Enclosure', status: 'available' }
];

export const getChurchResources = (): ChurchResource[] => {
  try {
    const raw = localStorage.getItem(RESOURCES_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error("Error loading church resources:", e);
  }
  return INITIAL_RESOURCES;
};

export const saveChurchResources = (resources: ChurchResource[]): void => {
  try {
    localStorage.setItem(RESOURCES_STORAGE_KEY, JSON.stringify(resources));
    window.dispatchEvent(new Event('church_resources_updated'));
  } catch (e) {
    console.error("Error saving church resources:", e);
  }
};

export const getEventResourceReservations = (eventId?: string): EventResourceReservation[] => {
  try {
    const raw = localStorage.getItem(RESERVATIONS_STORAGE_KEY);
    if (raw) {
      const all: EventResourceReservation[] = JSON.parse(raw);
      if (eventId) return all.filter(r => r.event_id === eventId);
      return all;
    }
  } catch (e) {
    console.error("Error loading resource reservations:", e);
  }
  return [
    {
      id: 'resv-1',
      event_id: 'evt-1',
      event_title: 'Annual Harvest & Thanksgiving Revival',
      resource_id: 'res-3',
      resource_name: 'Padded Banquet Chairs (Set of 50)',
      category: 'Seating & Furniture',
      quantity_reserved: 2,
      rental_cost_sle: 300,
      status: 'confirmed',
      reserved_at: new Date().toISOString(),
      notes: 'Reserved for overflow seating in the courtyard'
    }
  ];
};

export const saveEventResourceReservations = (reservations: EventResourceReservation[]): void => {
  try {
    localStorage.setItem(RESERVATIONS_STORAGE_KEY, JSON.stringify(reservations));
    window.dispatchEvent(new Event('resource_reservations_updated'));
  } catch (e) {
    console.error("Error saving resource reservations:", e);
  }
};
