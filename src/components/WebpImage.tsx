import type { ImgHTMLAttributes } from 'react'

interface WebpImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  webp: string
}

function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`.replace(/([^:]\/)\/+/g, '$1')
}

export function WebpImage({ webp, src, alt = '', ...props }: WebpImageProps) {
  return (
    <picture>
      <source srcSet={assetUrl(webp)} type="image/webp" />
      <img {...props} src={src ? assetUrl(src) : undefined} alt={alt} />
    </picture>
  )
}
