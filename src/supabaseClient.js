import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qskddruzamdgobplaipr.supabase.co'
const supabaseKey = 'sb_publishable_ckIMd3B1VIrNHgfyc4JcrQ_3UiLHeDk'

export const supabase = createClient(supabaseUrl, supabaseKey)