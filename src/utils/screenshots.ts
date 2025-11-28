import { Screenshot } from "../types/screenshots"

type RawScreenshotsResponse =
  | Screenshot[]
  | {
      success?: boolean
      previews?: Screenshot[] | null
      error?: string
    }
  | undefined
  | null

export const normalizeScreenshotsResponse = (
  response: RawScreenshotsResponse
): Screenshot[] => {
  if (Array.isArray(response)) {
    return response
  }

  if (response && Array.isArray(response.previews)) {
    return response.previews
  }

  return []
}
