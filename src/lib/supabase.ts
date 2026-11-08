import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { supabaseAnonKey, supabaseUrl } from './env'

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
