import { z } from 'zod'

// Validador para Customer ID de Google Ads (10 dígitos, con o sin guiones)
export const customerIdSchema = z.string()
  .transform(val => val.replace(/-/g, '')) // Remover guiones
  .refine(val => /^\d{10}$/.test(val), {
    message: 'Customer ID debe tener 10 dígitos'
  })

// Validador para Campaign ID (numérico)
export const campaignIdSchema = z.string()
  .regex(/^\d+$/, 'Campaign ID debe ser numérico')

// Validador para nombre de campaña
export const campaignNameSchema = z.string()
  .min(1, 'El nombre de campaña es requerido')
  .max(255, 'El nombre de campaña no puede exceder 255 caracteres')
  .trim()

// Validador para CPC Ceiling (valor positivo en euros)
export const cpcCeilingSchema = z.number()
  .positive('CPC Ceiling debe ser positivo')
  .max(10000, 'CPC Ceiling no puede exceder 10,000€')
  .finite()

// Schema para crear/actualizar configuración CPC
export const cpcConfigSchema = z.object({
  campaignName: campaignNameSchema,
  cpcCeiling: cpcCeilingSchema,
})

// Schema para bulk update de campañas
export const bulkUpdateSchema = z.object({
  customerId: z.string().min(1, 'customerId es requerido'),
  campaigns: z.array(
    z.object({
      campaignName: campaignNameSchema,
      newCpcCeiling: cpcCeilingSchema,
    })
  ).min(1, 'Debe incluir al menos una campaña'),
})

// Validador para rango de fechas
export const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').optional(),
}).refine(
  data => {
    if (data.startDate && data.endDate) {
      return new Date(data.startDate) <= new Date(data.endDate)
    }
    return true
  },
  { message: 'startDate debe ser menor o igual a endDate' }
)

// Tipo inferido de los schemas
export type CpcConfigInput = z.infer<typeof cpcConfigSchema>
export type BulkUpdateInput = z.infer<typeof bulkUpdateSchema>
export type DateRangeInput = z.infer<typeof dateRangeSchema>
