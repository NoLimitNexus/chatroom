// Generic Object Factory for instantiating world environmental props (Campfires, Trees, Rocks, etc.)
window.ObjectFactory = {
    create: function(type, config = {}) {
        let instance = null;

        if (type === 'Campfire' && window.Campfire) {
            instance = new window.Campfire();
            if (config && Object.keys(config).length > 0) {
                Object.assign(instance.config, config);
            }
        }
        // Easy to expand with more object types here:
        // else if (type === 'Tree') { ... }

        if (instance) {
            return {
                group: instance.group,
                updatable: instance // Can be null if object has no update loop
            };
        }

        console.warn(`ObjectFactory: Unknown or missing object type '${type}'`);
        return null;
    }
};
