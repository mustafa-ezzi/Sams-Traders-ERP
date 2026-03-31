import Size from "../models/size.js";

// Create a new size
export const createSize = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    const existingSize = await Size.findOne({ name });
    if (existingSize)
      return res.status(400).json({ message: "Size already exists" });

    const size = await Size.create({ name });
    res.status(201).json(size);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all sizes
export const getAllSizes = async (req, res) => {
  try {
    const sizes = await Size.find();
    res.status(200).json(sizes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get size by ID
export const getSizeById = async (req, res) => {
  try {
    const size = await Size.findById(req.params.id);
    if (!size) return res.status(404).json({ message: "Size not found" });
    res.status(200).json(size);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update size
export const updateSize = async (req, res) => {
  try {
    const { name } = req.body;
    const size = await Size.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true, runValidators: true }
    );
    if (!size) return res.status(404).json({ message: "Size not found" });
    res.status(200).json(size);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete size
export const deleteSize = async (req, res) => {
  try {
    const size = await Size.findByIdAndDelete(req.params.id);
    if (!size) return res.status(404).json({ message: "Size not found" });
    res.status(200).json({ message: "Size deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};