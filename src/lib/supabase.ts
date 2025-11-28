// Mock Supabase client for the application to run without authentication

// Create a mock client that doesn't do anything
export const supabase = {
  auth: {
    getUser: async (...args: any[]) => ({ data: { user: null }, error: null }),
    signInWithOAuth: async (...args: any[]) => ({ data: null, error: null }),
    signInWithPassword: async (...args: any[]) => ({ data: null, error: null }),
    signUp: async (...args: any[]) => ({ data: null, error: null }),
    signOut: async (...args: any[]) => ({ error: null }),
    onAuthStateChange: (...args: any[]) => {
      return { data: { subscription: { unsubscribe: () => { } } } }
    },
    exchangeCodeForSession: async (...args: any[]) => ({ data: null, error: null })
  },
  from: (...args: any[]) => ({
    select: (...args: any[]) => ({
      eq: (...args: any[]) => ({
        single: async (...args: any[]) => ({ data: null, error: null }),
        maybeSingle: async (...args: any[]) => ({ data: null, error: null })
      }),
      maybeSingle: async (...args: any[]) => ({ data: null, error: null })
    }),
    update: (...args: any[]) => ({
      eq: (...args: any[]) => ({
        select: (...args: any[]) => ({
          single: async (...args: any[]) => ({ data: null, error: null })
        })
      })
    })
  }),
  channel: (...args: any[]) => ({
    on: (...args: any[]) => ({
      subscribe: (...args: any[]) => ({
        unsubscribe: () => { }
      })
    }),
    subscribe: (...args: any[]) => ({
      unsubscribe: () => { }
    }),
    unsubscribe: () => { }
  })
}

// Mock sign in function
export const signInWithGoogle = async () => {
  console.log("Mock Google sign in...")
  return { url: "#" }
}

let channel: ReturnType<typeof supabase.channel> | null = null

// Monitor auth state changes and manage realtime connection
supabase.auth.onAuthStateChange((event: any, session: any) => {
  console.log("Auth state changed:", event, session?.user?.id)
  console.log("Full session data:", session)

  if (event === "SIGNED_IN" && session) {
    // Only establish realtime connection after successful sign in
    console.log("Establishing realtime connection...")

    // Clean up existing channel if any
    if (channel) {
      channel.unsubscribe()
    }

    channel = supabase.channel("system", {
      config: {
        presence: {
          key: session.user.id
        }
      }
    })

    channel
      .on("system", { event: "*" }, (payload: any) => {
        console.log("System event:", payload)
      })
      .subscribe((status: any) => {
        console.log("Realtime subscription status:", status)
        if (status === "SUBSCRIBED") {
          console.log("Successfully connected to realtime system")
        }
        if (status === "CHANNEL_ERROR") {
          console.error("Realtime connection error - will retry in 5s")
          setTimeout(() => {
            channel?.subscribe()
          }, 5000)
        }
      })
  }

  if (event === "SIGNED_OUT") {
    // Clean up realtime connection on sign out
    if (channel) {
      console.log("Cleaning up realtime connection")
      channel.unsubscribe()
      channel = null
    }
  }
})
