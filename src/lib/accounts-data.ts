export interface AccountConfig {
  id:       string   // 10 dígitos sin guiones
  name:     string
  currency: string
  country:  string
  region:   string
}

export const ACCOUNTS_CONFIG: AccountConfig[] = [
  { id: '7265261105', name: '01e. Air Europa ES', currency: 'EUR', country: 'ES', region: 'ES'    },
  { id: '9721363390', name: '02e. Air Europa FR', currency: 'EUR', country: 'FR', region: 'EU'    },
  { id: '7200237439', name: '03e. Air Europa IT', currency: 'EUR', country: 'IT', region: 'EU'    },
  { id: '6205999787', name: '04e. Air Europa EN', currency: 'GBP', country: 'EN', region: 'EU'    },
  { id: '1872903159', name: '05e. Air Europa PT', currency: 'EUR', country: 'PT', region: 'EU'    },
  { id: '6968181434', name: '06e. Air Europa HO', currency: 'EUR', country: 'HO', region: 'EU'    },
  { id: '6094484638', name: '07e. Air Europa DE', currency: 'EUR', country: 'DE', region: 'EU'    },
  { id: '9998533558', name: '08e. Air Europa ZA', currency: 'EUR', country: 'ZA', region: 'AF'    },
  { id: '5337044638', name: '09e. Air Europa US', currency: 'USD', country: 'US', region: 'USA'   },
  { id: '3225568720', name: '10e. Air Europa BE', currency: 'EUR', country: 'BE', region: 'EU'    },
  { id: '1299102083', name: '11e. Air Europa AR', currency: 'USD', country: 'AR', region: 'LATAM' },
  { id: '9149639057', name: '12e. Air Europa BR', currency: 'BRL', country: 'BR', region: 'LATAM' },
  { id: '6202803187', name: '13e. Air Europa UY', currency: 'USD', country: 'UY', region: 'LATAM' },
  { id: '1969786202', name: '14e. Air Europa RD', currency: 'USD', country: 'RD', region: 'LATAM' },
  { id: '4236627473', name: '15e. Air Europa MX', currency: 'USD', country: 'MX', region: 'LATAM' },
  { id: '2676052361', name: '16e. Air Europa PY', currency: 'USD', country: 'PY', region: 'LATAM' },
  { id: '7726110075', name: '17e. Air Europa BO', currency: 'USD', country: 'BO', region: 'LATAM' },
  { id: '6129173546', name: '18e. Air Europa PE', currency: 'USD', country: 'PE', region: 'LATAM' },
  { id: '6462980290', name: '19e. Air Europa CO', currency: 'USD', country: 'CO', region: 'LATAM' },
  { id: '9420679421', name: '20e. Air Europa CH', currency: 'CHF', country: 'CH', region: 'EU'    },
  { id: '9045803018', name: '21e. Air Europa IL', currency: 'USD', country: 'IL', region: 'EU'    },
  { id: '8624289888', name: '22e. Air Europa EC', currency: 'USD', country: 'EC', region: 'LATAM' },
  { id: '6219366852', name: '23e. Air Europa PA', currency: 'USD', country: 'PA', region: 'LATAM' },
]

export const REGIONS = ['ES', 'EU', 'USA', 'LATAM', 'AF'] as const
export type Region = typeof REGIONS[number]

export function getIdsByRegion(region: string): string[] {
  return ACCOUNTS_CONFIG.filter(a => a.region === region).map(a => a.id)
}

export function getConfigById(id: string): AccountConfig | undefined {
  return ACCOUNTS_CONFIG.find(a => a.id === id)
}
