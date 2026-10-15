import type { MetadataRoute } from 'next'
export default function manifest():MetadataRoute.Manifest{return {name:'eCHIMS',short_name:'eCHIMS',description:'Child health records and offline drafts',start_url:'/offline',display:'standalone',background_color:'#f5f7fa',theme_color:'#075985',icons:[{src:'/offline-icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}]}}
