const TRACKING_PARAMS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'fbclid',
    'gclid',
    'mc_cid',
    'mc_eid',
];

export function removeTrackingParams(url: URL): URL {
    for (const key of TRACKING_PARAMS) {
        url.searchParams.delete(key);
    }

    return url;
}
