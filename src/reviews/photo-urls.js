const defaultReviewPhotoBucket = "review-photos";
const signedPhotoUrlLifetimeSeconds = 60 * 60 * 24 * 7;

export async function createSignedPhotoUrls({ photos = [], supabase }) {
  if (!supabase || photos.length === 0) {
    return [];
  }

  const photosByBucket = new Map();

  for (const [index, photo] of photos.entries()) {
    const bucket = photo.storage_bucket ?? defaultReviewPhotoBucket;
    const bucketPhotos = photosByBucket.get(bucket) ?? [];
    bucketPhotos.push({ index, photo });
    photosByBucket.set(bucket, bucketPhotos);
  }

  const signedPhotos = new Array(photos.length);

  await Promise.all(
    [...photosByBucket.entries()].map(async ([bucket, bucketPhotos]) => {
      const paths = bucketPhotos.map(({ photo }) => photo.storage_path);
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, signedPhotoUrlLifetimeSeconds);

      if (error) {
        return;
      }

      for (const [bucketIndex, { index, photo }] of bucketPhotos.entries()) {
        const result = data?.[bucketIndex];

        if (result?.error || !result?.signedUrl) {
          continue;
        }

        signedPhotos[index] = {
          id: photo.id,
          reviewId: photo.review_id,
          sortOrder: photo.sort_order ?? 0,
          url: result.signedUrl
        };
      }
    })
  );

  return signedPhotos.filter(Boolean);
}
