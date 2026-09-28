const STUDENT_PHOTO_BUCKET = 'student-photos';
const STUDENT_PHOTO_VALID_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const STUDENT_PHOTO_MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8MB, before compression

// Resize/compress an image file client-side before it ever leaves the
// browser, so we don't burn through Supabase's free-tier storage on
// full-resolution phone photos.
function compressImageFile(file, maxDim = 480, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file does not look like a valid image.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round(height * (maxDim / width));
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round(width * (maxDim / height));
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('Could not process that image.'))),
          'image/jpeg',
          quality
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function validateStudentPhotoFile(file) {
  if (!STUDENT_PHOTO_VALID_TYPES.includes(file.type)) {
    throw new Error('Please choose a JPG, PNG, or WEBP image.');
  }
  if (file.size > STUDENT_PHOTO_MAX_UPLOAD_BYTES) {
    throw new Error('That image is too large (max 8MB).');
  }
}

// Compresses, uploads to Storage at `<year>/<studentId>.jpg`, and cleans
// up the previous photo if it lived at a different path (e.g. an earlier
// year). Returns the new photo_path to save on the student's row.
async function uploadStudentPhoto(studentId, file, previousPhotoPath) {
  validateStudentPhotoFile(file);
  const compressed = await compressImageFile(file);
  const path = `${new Date().getFullYear()}/${studentId}.jpg`;

  const { error: uploadError } = await supabaseClient.storage
    .from(STUDENT_PHOTO_BUCKET)
    .upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  if (previousPhotoPath && previousPhotoPath !== path) {
    await supabaseClient.storage.from(STUDENT_PHOTO_BUCKET).remove([previousPhotoPath]);
  }

  return path;
}

async function deleteStudentPhotoFile(photoPath) {
  if (!photoPath) return;
  await supabaseClient.storage.from(STUDENT_PHOTO_BUCKET).remove([photoPath]);
}

// Resolves whatever a student record has into a usable <img> src:
// prefer a Storage-managed photo_path, fall back to a manually-pasted
// photo_url, fall back to nothing (caller shows initials instead).
function studentPhotoUrl(student) {
  if (student?.photo_path) {
    return supabaseClient.storage.from(STUDENT_PHOTO_BUCKET).getPublicUrl(student.photo_path).data.publicUrl;
  }
  return student?.photo_url || null;
}

// ---- Same pipeline, for teachers (separate bucket) ----
const TEACHER_PHOTO_BUCKET = 'teacher-photos';

async function uploadTeacherPhoto(teacherId, file, previousPhotoPath) {
  validateStudentPhotoFile(file); // same validation rules apply
  const compressed = await compressImageFile(file);
  const path = `${new Date().getFullYear()}/${teacherId}.jpg`;

  const { error: uploadError } = await supabaseClient.storage
    .from(TEACHER_PHOTO_BUCKET)
    .upload(path, compressed, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) throw uploadError;

  if (previousPhotoPath && previousPhotoPath !== path) {
    await supabaseClient.storage.from(TEACHER_PHOTO_BUCKET).remove([previousPhotoPath]);
  }

  return path;
}

async function deleteTeacherPhotoFile(photoPath) {
  if (!photoPath) return;
  await supabaseClient.storage.from(TEACHER_PHOTO_BUCKET).remove([photoPath]);
}

function teacherPhotoUrl(teacher) {
  if (teacher?.photo_path) {
    return supabaseClient.storage.from(TEACHER_PHOTO_BUCKET).getPublicUrl(teacher.photo_path).data.publicUrl;
  }
  return teacher?.photo_url || null;
}
