import multer from "multer";
import { v2 as cloudinary } from "cloudinary";

export const uploads = multer({ dest: "./temp" });

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

export const uploadFiles = async (file) => {
  const photoConfig = {
    folder: "products",
    width: 400,
    height: 400,
    use_filename: true,
    unique_filename: false,
  };

  try {
    const result = await cloudinary.uploader.upload(file, photoConfig);
    return result;
  } catch (error) {
    console.log(error);
    return error;
  }
};

export const uploadPayments = async (file) => {
  const photoConfig = {
    folder: "payments",
    use_filename: true,
    unique_filename: false,
  };

  try {
    const result = await cloudinary.uploader.upload(file, photoConfig);
    return result;
  } catch (error) {
    console.log(error);
    return error;
  }
};
